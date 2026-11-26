import { inject, Injectable, signal } from '@angular/core';
import { AuthTokens, SessionUser } from '../Biblioteca/biblioteca.models';
import { APP_CONFIG } from './app-config';
import { isAuthTokens, isSessionUser, SessionIntegrity } from './session-integrity';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly config = inject(APP_CONFIG);
  private readonly integrity = new SessionIntegrity(this.config.sessionSecret);
  private readonly tokensState = signal<AuthTokens | null>(null);
  private readonly userState = signal<SessionUser | null>(null);
  private hydrated = false;

  readonly tokens = this.tokensState.asReadonly();
  readonly user = this.userState.asReadonly();

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    const [tokens, user] = await Promise.all([
      this.read<AuthTokens>(this.config.sessionKeys.tokens, isAuthTokens),
      this.read<SessionUser>(this.config.sessionKeys.user, isSessionUser),
    ]);

    if (Boolean(tokens) !== Boolean(user)) {
      await this.clearPersisted();
      this.tokensState.set(null);
      this.userState.set(null);
      return;
    }

    this.tokensState.set(tokens ? Object.freeze({ ...tokens }) : null);
    this.userState.set(user ? Object.freeze({ ...user }) : null);
  }

  async saveTokens(tokens: AuthTokens): Promise<void> {
    const sealed = Object.freeze({ ...tokens });
    this.tokensState.set(sealed);
    await this.write(this.config.sessionKeys.tokens, sealed);
  }

  async saveUser(user: SessionUser): Promise<void> {
    const sealed = Object.freeze({ ...user });
    this.userState.set(sealed);
    await this.write(this.config.sessionKeys.user, sealed);
  }

  clear(): void {
    this.tokensState.set(null);
    this.userState.set(null);
    void this.clearPersisted();
  }

  private async read<T>(key: string, guard: (value: unknown) => value is T): Promise<T | null> {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = await this.integrity.open(raw, guard);
    if (!value) sessionStorage.removeItem(key);
    return value;
  }

  private async write<T>(key: string, value: T): Promise<void> {
    sessionStorage.setItem(key, await this.integrity.seal(value));
  }

  private async clearPersisted(): Promise<void> {
    sessionStorage.removeItem(this.config.sessionKeys.tokens);
    sessionStorage.removeItem(this.config.sessionKeys.user);
  }
}
