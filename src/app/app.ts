import { Component, inject, signal } from '@angular/core';
import { BibliotecaAdminComponent } from './Biblioteca/biblioteca-admin.component';
import { BibliotecaAuthComponent } from './Biblioteca/biblioteca-auth.component';
import { BibliotecaAuthService } from './Biblioteca/biblioteca-api.service';
import { bibliotecaErrorMessage } from './Biblioteca/biblioteca-error';
import { SessionUser } from './Biblioteca/biblioteca.models';
import { BibliotecaComponent } from './Biblioteca/biblioteca.component';

@Component({
  imports: [BibliotecaAdminComponent, BibliotecaAuthComponent, BibliotecaComponent],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  private readonly auth = inject(BibliotecaAuthService);

  readonly user = signal(this.auth.signedInUser());
  readonly sessionError = signal('');
  readonly signingOut = signal(false);

  onAuthenticated(user: SessionUser): void {
    this.sessionError.set('');
    this.user.set(user);
  }

  signOut(): void {
    if (this.signingOut()) return;
    this.sessionError.set('');
    this.signingOut.set(true);
    this.auth.logout().subscribe({
      next: () => this.user.set(null),
      error: (error: unknown) => {
        this.user.set(null);
        this.sessionError.set(
          `La sesión se cerró en este navegador, pero la API notificó un error: ${bibliotecaErrorMessage(error, 'Error al cerrar sesión.')}`,
        );
        this.signingOut.set(false);
      },
      complete: () => this.signingOut.set(false),
    });
  }
}
