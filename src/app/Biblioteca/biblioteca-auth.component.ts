import { Component, inject, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BibliotecaAuthService } from './biblioteca-api.service';
import { bibliotecaErrorMessage } from './biblioteca-error';
import { SessionUser, UserRole } from './biblioteca.models';

type AuthMode = 'role' | 'login' | 'register' | 'verify';

@Component({
  selector: 'app-biblioteca-auth',
  imports: [ReactiveFormsModule],
  templateUrl: './biblioteca-auth.component.html',
})
export class BibliotecaAuthComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly auth = inject(BibliotecaAuthService);

  readonly authenticated = output<SessionUser>();
  readonly mode = signal<AuthMode>('role');
  readonly selectedRole = signal<UserRole>('user');
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  readonly loginForm = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  readonly registerForm = this.formBuilder.group({
    fullName: ['', Validators.required],
    userName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: ['', Validators.required],
    address: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  });

  ngOnInit(): void {
    this.checkEmailConfirmation();
  }

  chooseRole(role: UserRole): void {
    this.selectedRole.set(role);
    this.mode.set('login');
    this.clearFeedback();
  }

  openRegistration(): void {
    this.mode.set('register');
    this.clearFeedback();
  }

  backToRoles(): void {
    this.mode.set('role');
    this.clearFeedback();
  }

  async signIn(): Promise<void> {
    this.clearFeedback();
    this.loginForm.markAllAsTouched();
    if (this.loginForm.invalid) return;

    this.busy.set(true);
    const { email, password } = this.loginForm.getRawValue();
    try {
      const tokens = await this.auth.login(email, password);
      const user = this.auth.userFromToken(tokens, email, this.selectedRole());
      if (user.role !== this.selectedRole()) {
        this.auth.clearSession();
        throw new Error(
          `Esta cuenta no tiene el rol ${this.selectedRole() === 'admin' ? 'administrador' : 'usuario'}.`,
        );
      }
      this.auth.saveUser(user);
      this.authenticated.emit(user);
    } catch (error: unknown) {
      this.auth.clearSession();
      this.error.set(bibliotecaErrorMessage(error, 'No se pudo iniciar sesión.'));
    } finally {
      this.busy.set(false);
    }
  }

  register(): void {
    this.clearFeedback();
    this.registerForm.markAllAsTouched();
    if (this.registerForm.invalid) return;

    const details = this.registerForm.getRawValue();
    if (details.password !== details.confirmPassword) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }

    this.busy.set(true);
    this.auth
      .register({
        address: details.address,
        email: details.email,
        fullName: details.fullName,
        password: details.password,
        phoneNumber: details.phoneNumber,
        userName: details.userName,
      })
      .subscribe({
        next: () => {
          this.mode.set('verify');
          this.message.set(
            'Cuenta creada. Revisa tu correo y abre el enlace de confirmación antes de iniciar sesión.',
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(bibliotecaErrorMessage(error, 'No se pudo crear la cuenta.'));
        },
        complete: () => this.busy.set(false),
      });
  }

  private checkEmailConfirmation(): void {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('userId');
    const token = params.get('token');
    if (!userId || !token) return;

    this.busy.set(true);
    this.auth.confirmEmail(userId, token).subscribe({
      next: () => {
        this.mode.set('login');
        this.message.set('Correo confirmado. Ya puedes iniciar sesión.');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.mode.set('login');
        this.error.set(bibliotecaErrorMessage(error, 'No se pudo confirmar el correo.'));
      },
      complete: () => this.busy.set(false),
    });
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  private clearFeedback(): void {
    this.message.set('');
    this.error.set('');
  }
}
