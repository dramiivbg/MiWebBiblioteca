import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  catchError,
  defer,
  firstValueFrom,
  from,
  finalize,
  map,
  Observable,
  ReplaySubject,
  share,
  switchMap,
  throwError,
} from 'rxjs';
import { AuthClaims, AuthTokens, SessionUser, UserRole } from '../Biblioteca/biblioteca.models';
import { APP_CONFIG } from './app-config';
import { SKIP_AUTH } from './auth-context';
import { SessionStore } from './session.store';

interface RegisterDetails {
  address: string;
  email: string;
  fullName: string;
  password: string;
  phoneNumber: string;
  userName: string;
}

interface AuthTokenResponse {
  accessToken?: string | null;
  accessTokenExpiresAt?: string;
  expiresAt?: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class BibliotecaAuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly store = inject(SessionStore);
  private readonly skipAuth = new HttpContext().set(SKIP_AUTH, true);

  readonly session = this.store.tokens;
  readonly signedInUser = this.store.user;

  private readonly refresh$ = defer(() =>
    this.http.post<unknown>(`${this.config.apiUrl}/auth/refresh`, null, {
      withCredentials: true,
      context: this.skipAuth,
    }),
  ).pipe(
    map((raw) => {
      const response = this.asTokenResponse(raw);
      if (!response?.accessToken) {
        throw new Error('La API refresh no devolvió un nuevo JWT de acceso.');
      }
      return {
        accessToken: response.accessToken,
        accessTokenExpiresAt:
          response.accessTokenExpiresAt ??
          response.expiresAt ??
          this.expirationFromToken(response.accessToken),
      };
    }),
    switchMap((tokens) => from(this.store.saveTokens(tokens)).pipe(map(() => tokens))),
    catchError((error: unknown) => {
      this.store.clear();
      return throwError(() => error);
    }),
    share({
      connector: () => new ReplaySubject<AuthTokens>(1),
      resetOnError: true,
      resetOnComplete: true,
      resetOnRefCountZero: true,
    }),
  );

  accessToken(): string | null {
    return this.store.tokens()?.accessToken ?? null;
  }

  shouldRefresh(): boolean {
    const expiresAt = this.store.tokens()?.accessTokenExpiresAt;
    return Boolean(expiresAt && Date.parse(expiresAt) <= Date.now() + 30_000);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const loginResponse = this.asTokenResponse(
      await firstValueFrom(
        this.http.post<unknown>(
          `${this.config.apiUrl}/auth/login`,
          { email, password },
          { withCredentials: true, context: this.skipAuth },
        ),
      ),
    );
    if (!loginResponse?.accessToken) {
      throw new Error('La API de login no devolvió un JWT de acceso.');
    }

    const tokens: AuthTokens = {
      accessToken: loginResponse.accessToken,
      accessTokenExpiresAt:
        loginResponse.accessTokenExpiresAt ??
        loginResponse.expiresAt ??
        this.expirationFromToken(loginResponse.accessToken),
    };
    await this.store.saveTokens(tokens);
    return tokens;
  }

  async saveUser(user: SessionUser): Promise<void> {
    await this.store.saveUser(user);
  }

  register(details: RegisterDetails): Observable<void> {
    const user = {
      id: null,
      address: details.address,
      userName: details.userName,
      email: details.email,
      emailConfirmed: false,
      password: details.password,
      phoneNumber: details.phoneNumber,
      role: 0,
      phoneNumberConfirmed: false,
      lockoutEnd: null,
      lockoutEnabled: false,
      accessFailedCount: 0,
      fullName: details.fullName,
    };
    return this.http
      .post<void>(`${this.config.apiUrl}/auth/register`, user, { context: this.skipAuth })
      .pipe(map(() => undefined));
  }

  confirmEmail(userId: string, token: string): Observable<void> {
    const params = new HttpParams().set('userId', userId).set('token', token);
    return this.http
      .get<void>(`${this.config.apiUrl}/auth/confirm-email`, {
        params,
        context: this.skipAuth,
      })
      .pipe(map(() => undefined));
  }

  forgotPassword(email: string): Observable<ForgotPasswordResponse> {
    return this.http.post<ForgotPasswordResponse>(
      `${this.config.apiUrl}/auth/forgot-password`,
      JSON.stringify(email),
      {
        headers: { 'Content-Type': 'application/json' },
        withCredentials: true,
        context: this.skipAuth,
      },
    );
  }

  refresh(): Observable<AuthTokens> {
    return this.refresh$;
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${this.config.apiUrl}/auth/logout`, null, {
        withCredentials: true,
        context: this.skipAuth,
      })
      .pipe(
        map(() => undefined),
        finalize(() => this.store.clear()),
      );
  }

  clearSession(): void {
    this.store.clear();
  }

  userFromToken(tokens: AuthTokens, email: string, selectedRole: UserRole): SessionUser {
    const claims = this.readClaims(tokens.accessToken);
    const id =
      this.claimString(claims, [
        'sub',
        'nameid',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
        'userId',
        'uid',
      ]) ?? '';

    if (!id) {
      throw new Error('El token no contiene el identificador de usuario necesario.');
    }

    const roleClaim = this.claimString(claims, [
      'role',
      'roles',
      'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
    ]);

    return {
      id,
      email,
      name:
        this.claimString(claims, [
          'name',
          'unique_name',
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
        ]) ?? email,
      role: this.normalizeRole(roleClaim) ?? selectedRole,
    };
  }

  private readClaims(token: string): AuthClaims {
    try {
      const payload = token.split('.')[1];
      if (!payload) return {};
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      const value: unknown = JSON.parse(decoded);
      return typeof value === 'object' && value !== null ? (value as AuthClaims) : {};
    } catch {
      return {};
    }
  }

  private expirationFromToken(token: string): string {
    const expiresAt = this.readClaims(token)['exp'];
    if (typeof expiresAt === 'number') {
      return new Date(expiresAt * 1000).toISOString();
    }
    throw new Error('La API no devolvió la fecha de expiración del JWT.');
  }

  private asTokenResponse(value: unknown): AuthTokenResponse | null {
    if (typeof value !== 'object' || value === null) return null;
    const response = value as Record<string, unknown>;
    return {
      accessToken: typeof response['accessToken'] === 'string' ? response['accessToken'] : null,
      accessTokenExpiresAt:
        typeof response['accessTokenExpiresAt'] === 'string'
          ? response['accessTokenExpiresAt']
          : typeof response['expiresAt'] === 'string'
            ? response['expiresAt']
            : undefined,
    };
  }

  private claimString(claims: AuthClaims, names: string[]): string | null {
    for (const name of names) {
      const value = claims[name];
      if (typeof value === 'string' || typeof value === 'number') {
        return String(value);
      }
      if (Array.isArray(value) && typeof value[0] === 'string') {
        return value[0];
      }
    }
    return null;
  }

  private normalizeRole(value: string | null): UserRole | null {
    switch (value?.toLowerCase()) {
      case 'admin':
      case 'administrator':
      case '1':
        return 'admin';
      case 'user':
      case '0':
        return 'user';
      default:
        return null;
    }
  }
}
