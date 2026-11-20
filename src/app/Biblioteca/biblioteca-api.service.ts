import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import {
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  map,
  shareReplay,
  tap,
  throwError,
} from 'rxjs';
import {
  AuthClaims,
  AuthTokens,
  Book,
  LibraryUser,
  Reservation,
  SessionUser,
  UserRole,
} from './biblioteca.models';

const API_URL = 'http://localhost:5000/api';
const SESSION_KEY = 'biblioteca.session';

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

@Injectable({ providedIn: 'root' })
export class BibliotecaAuthService {
  private readonly http = inject(HttpClient);
  private refreshRequest: Observable<AuthTokens> | null = null;
  private readonly currentSession = signal<AuthTokens | null>(this.readSession());
  private readonly currentUser = signal<SessionUser | null>(this.readUser());

  readonly session = this.currentSession.asReadonly();
  readonly signedInUser = this.currentUser.asReadonly();

  accessToken(): string | null {
    return this.currentSession()?.accessToken ?? null;
  }

  shouldRefresh(): boolean {
    const expiresAt = this.currentSession()?.accessTokenExpiresAt;
    return Boolean(expiresAt && Date.parse(expiresAt) <= Date.now() + 30_000);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const loginResponse = this.asTokenResponse(
      await firstValueFrom(
        this.http.post<unknown>(
          `${API_URL}/auth/login`,
          { email, password },
          { withCredentials: true },
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
    this.saveSession(tokens);
    return tokens;
  }

  saveUser(user: SessionUser): void {
    this.currentUser.set(user);
    sessionStorage.setItem(`${SESSION_KEY}.user`, JSON.stringify(user));
  }

  register(details: RegisterDetails): Observable<void> {
    const user: LibraryUser = {
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
      .post<void>(`${API_URL}/auth/register`, user)
      .pipe(map(() => undefined));
  }

  confirmEmail(userId: string, token: string): Observable<void> {
    const params = new HttpParams().set('userId', userId).set('token', token);
    return this.http
      .get<void>(`${API_URL}/auth/confirm-email`, { params })
      .pipe(map(() => undefined));
  }

  refresh(): Observable<AuthTokens> {
    if (this.refreshRequest) return this.refreshRequest;

    this.refreshRequest = this.http
      .post<unknown>(`${API_URL}/auth/refresh`, null, { withCredentials: true })
      .pipe(
        map((rawResponse) => {
          const response = this.asTokenResponse(rawResponse);
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
        tap((tokens) => this.saveSession(tokens)),
        catchError((error: unknown) => {
          this.clearSession();
          return throwError(() => error);
        }),
        finalize(() => {
          this.refreshRequest = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.refreshRequest;
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${API_URL}/auth/logout`, null, { withCredentials: true })
      .pipe(
        map(() => undefined),
        finalize(() => this.clearSession()),
      );
  }

  clearSession(): void {
    this.currentSession.set(null);
    this.currentUser.set(null);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(`${SESSION_KEY}.user`);
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

  private saveSession(tokens: AuthTokens): void {
    this.currentSession.set(tokens);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(tokens));
  }

  private readSession(): AuthTokens | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'accessToken' in parsed &&
        typeof parsed.accessToken === 'string' &&
        'accessTokenExpiresAt' in parsed &&
        typeof parsed.accessTokenExpiresAt === 'string'
      ) {
        const session = {
          accessToken: parsed.accessToken,
          accessTokenExpiresAt: parsed.accessTokenExpiresAt,
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
    return null;
  }

  private readUser(): SessionUser | null {
    try {
      const raw = sessionStorage.getItem(`${SESSION_KEY}.user`);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'id' in parsed &&
        typeof parsed.id === 'string' &&
        'email' in parsed &&
        typeof parsed.email === 'string' &&
        'name' in parsed &&
        typeof parsed.name === 'string' &&
        'role' in parsed &&
        (parsed.role === 'user' || parsed.role === 'admin')
      ) {
        return parsed as SessionUser;
      }
    } catch {
      sessionStorage.removeItem(`${SESSION_KEY}.user`);
    }
    return null;
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

@Injectable({ providedIn: 'root' })
export class BibliotecaApiService {
  private readonly http = inject(HttpClient);

  books(filters: { title?: string; author?: string } = {}): Observable<Book[]> {
    let params = new HttpParams();
    if (filters.title) params = params.set('title', filters.title);
    if (filters.author) params = params.set('author', filters.author);
    return this.http.get<Book[]>(`${API_URL}/Book`, { params });
  }

  createBook(book: Omit<Book, 'id'>): Observable<Book> {
    return this.http.post<Book>(`${API_URL}/book`, { id: 0, ...book });
  }

  updateBook(book: Book): Observable<Book> {
    return this.http.put<Book>(`${API_URL}/book/${book.id}`, book);
  }

  deleteBook(bookId: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/book/${bookId}`);
  }

  reservations(userId?: string): Observable<Reservation[]> {
    let params = new HttpParams();
    if (userId) params = params.set('userId', userId);
    return this.http.get<Reservation[]>(`${API_URL}/reservation`, { params });
  }

  createReservation(
    reservation: Omit<Reservation, 'id' | 'isReturned'>,
  ): Observable<Reservation> {
    return this.http.post<Reservation>(`${API_URL}/reservation`, {
      ...reservation,
      isReturned: false,
    });
  }

  markReturned(reservationId: number): Observable<Reservation> {
    return this.http.put<Reservation>(`${API_URL}/reservation/${reservationId}/return`, null);
  }

  users(): Observable<LibraryUser[]> {
    return this.http.get<LibraryUser[]>(`${API_URL}/User`);
  }

  setUserEnabled(userId: string, enabled: boolean): Observable<void> {
    const action = enabled ? 'enable' : 'disable';
    return this.http
      .get<void>(`${API_URL}/user/${encodeURIComponent(userId)}/${action}`)
      .pipe(map(() => undefined));
  }
}
