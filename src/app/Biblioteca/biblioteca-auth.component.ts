import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BibliotecaAuthService } from './biblioteca-api.service';
import { bibliotecaErrorMessage } from './biblioteca-error';
import { UserRole } from './biblioteca.models';
import { AuthFacade } from '../core/auth.facade';

type AuthMode = 'role' | 'login' | 'register' | 'verify' | 'forgot-password';

@Component({
  selector: 'app-biblioteca-auth',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './biblioteca-auth.component.html',
})
export class BibliotecaAuthComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly auth = inject(BibliotecaAuthService);
  private readonly facade = inject(AuthFacade);

  readonly mode = signal<AuthMode>('role');
  readonly selectedRole = signal<UserRole>('user');
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  readonly loginForm = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  readonly forgotPasswordForm = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
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

  openForgotPassword(): void {
    this.forgotPasswordForm.controls.email.setValue(this.loginForm.controls.email.value);
    this.mode.set('forgot-password');
    this.clearFeedback();
  }

  backToRoles(): void {
    this.mode.set('role');
    this.clearFeedback();
  }

  backToLogin(): void {
    this.mode.set('login');
    this.clearFeedback();
  }

  async signIn(): Promise<void> {
    this.clearFeedback();
    this.loginForm.markAllAsTouched();
    if (this.loginForm.invalid) return;

    this.busy.set(true);
    const { email, password } = this.loginForm.getRawValue();
    try {
      await this.facade.signIn(email, password, this.selectedRole());
    } catch (error: unknown) {
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

  forgotPassword(): void {
    this.clearFeedback();
    this.forgotPasswordForm.markAllAsTouched();
    if (this.forgotPasswordForm.invalid) return;

    this.busy.set(true);
    const { email } = this.forgotPasswordForm.getRawValue();
    this.auth.forgotPassword(email).subscribe({
      next: (response) => this.message.set(response.message),
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(
          bibliotecaErrorMessage(error, 'No se pudo solicitar el restablecimiento.'),
        );
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
