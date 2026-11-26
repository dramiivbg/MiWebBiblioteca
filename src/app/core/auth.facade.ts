import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BibliotecaAuthService } from '../Biblioteca/biblioteca-api.service';
import { bibliotecaErrorMessage } from '../Biblioteca/biblioteca-error';
import { UserRole } from '../Biblioteca/biblioteca.models';

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly auth = inject(BibliotecaAuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.signedInUser;
  readonly isAuthenticated = computed(() => Boolean(this.user()));
  readonly sessionError = signal('');
  readonly signingOut = signal(false);

  async signIn(email: string, password: string, role: UserRole): Promise<void> {
    this.sessionError.set('');
    const tokens = await this.auth.login(email, password);
    const user = this.auth.userFromToken(tokens, email, role);
    if (user.role !== role) {
      this.auth.clearSession();
      throw new Error(
        `Esta cuenta no tiene el rol ${role === 'admin' ? 'administrador' : 'usuario'}.`,
      );
    }
    await this.auth.saveUser(user);
    await this.router.navigateByUrl(role === 'admin' ? '/admin' : '/user');
  }

  async signOut(): Promise<void> {
    if (this.signingOut()) return;
    this.sessionError.set('');
    this.signingOut.set(true);
    try {
      await firstValueFrom(this.auth.logout());
    } catch (error: unknown) {
      this.sessionError.set(
        `La sesión se cerró en este navegador, pero la API notificó un error: ${bibliotecaErrorMessage(error, 'Error al cerrar sesión.')}`,
      );
    } finally {
      this.signingOut.set(false);
      await this.router.navigateByUrl('/login');
    }
  }

  clearSessionError(): void {
    this.sessionError.set('');
  }
}
