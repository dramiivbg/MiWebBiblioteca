import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { BibliotecaApiService, BibliotecaAuthService } from './biblioteca-api.service';
import { Book, LibraryUser, Reservation, SessionUser, UserRole } from './biblioteca.models';

type AuthMode = 'role' | 'login' | 'register' | 'verify';
type Section = 'catalog' | 'reservations' | 'books' | 'users';

@Component({
  selector: 'app-biblioteca',
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './biblioteca.component.html',
})
export class BibliotecaComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly auth = inject(BibliotecaAuthService);
  private readonly api = inject(BibliotecaApiService);

  readonly mode = signal<AuthMode>('role');
  readonly selectedRole = signal<UserRole>('user');
  readonly user = signal<SessionUser | null>(this.auth.signedInUser());
  readonly section = signal<Section>(
    this.auth.signedInUser()?.role === 'admin' ? 'reservations' : 'catalog',
  );
  readonly books = signal<Book[]>([]);
  readonly reservations = signal<Reservation[]>([]);
  readonly users = signal<LibraryUser[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly search = signal('');
  readonly editingBook = signal<Book | null>(null);
  readonly showBookForm = signal(false);

  readonly visibleBooks = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.books().filter(
      (book) =>
        !query ||
        book.title.toLocaleLowerCase().includes(query) ||
        book.author.toLocaleLowerCase().includes(query),
    );
  });
  readonly activeReservations = computed(
    () => this.reservations().filter((reservation) => !reservation.isReturned).length,
  );
  readonly totalCopies = computed(() =>
    this.books().reduce((total, book) => total + book.stock, 0),
  );

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

  readonly bookForm = this.formBuilder.group({
    title: ['', Validators.required],
    author: ['', Validators.required],
    description: ['', Validators.required],
    publishedDate: ['', Validators.required],
    stock: [1, [Validators.required, Validators.min(0)]],
    pages: [1, [Validators.required, Validators.min(1)]],
  });

  ngOnInit(): void {
    if (this.user()) {
      this.loadDashboard();
    } else {
      this.checkEmailConfirmation();
    }
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
      this.user.set(user);
      this.section.set(user.role === 'admin' ? 'reservations' : 'catalog');
      this.loadDashboard();
    } catch (error: unknown) {
      this.auth.clearSession();
      this.error.set(this.errorMessage(error, 'No se pudo iniciar sesión.'));
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
          this.error.set(this.errorMessage(error, 'No se pudo crear la cuenta.'));
        },
        complete: () => this.busy.set(false),
      });
  }

  setSection(section: Section): void {
    this.section.set(section);
    this.clearFeedback();
  }

  setSearch(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.search.set(event.target.value);
    }
  }

  reserve(book: Book): void {
    const user = this.user();
    if (!user || book.stock < 1) return;

    const reservationDate = new Date();
    const dueDate = new Date(reservationDate);
    dueDate.setDate(dueDate.getDate() + 14);
    this.busy.set(true);
    this.clearFeedback();
    this.api
      .createReservation({
        userId: user.id,
        bookId: book.id,
        reservationDate: reservationDate.toISOString(),
        dueDate: dueDate.toISOString(),
      })
      .subscribe({
        next: () => {
          this.message.set(`Reservaste «${book.title}». Tienes 14 días para devolverlo.`);
          this.loadDashboard();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(this.errorMessage(error, 'No se pudo reservar el libro.'));
        },
        complete: () => this.busy.set(false),
      });
  }

  returnBook(reservation: Reservation): void {
    this.busy.set(true);
    this.clearFeedback();
    this.api.markReturned(reservation.id).subscribe({
      next: () => {
        this.message.set('La devolución quedó confirmada.');
        this.loadDashboard();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(this.errorMessage(error, 'No se pudo confirmar la devolución.'));
      },
      complete: () => this.busy.set(false),
    });
  }

  openNewBook(): void {
    this.editingBook.set(null);
    this.bookForm.reset({
      title: '',
      author: '',
      description: '',
      publishedDate: new Date().toISOString().slice(0, 10),
      stock: 1,
      pages: 1,
    });
    this.showBookForm.set(true);
  }

  editBook(book: Book): void {
    this.editingBook.set(book);
    this.bookForm.reset({
      title: book.title,
      author: book.author,
      description: book.description,
      publishedDate: book.publishedDate.slice(0, 10),
      stock: book.stock,
      pages: book.pages,
    });
    this.showBookForm.set(true);
  }

  saveBook(): void {
    this.bookForm.markAllAsTouched();
    if (this.bookForm.invalid) return;

    const values = this.bookForm.getRawValue();
    const currentBook = this.editingBook();
    const payload: Omit<Book, 'id'> = {
      title: values.title,
      author: values.author,
      description: values.description,
      publishedDate: new Date(values.publishedDate).toISOString(),
      stock: Number(values.stock),
      pages: Number(values.pages),
    };

    this.busy.set(true);
    const request = currentBook
      ? this.api.updateBook({ ...payload, id: currentBook.id })
      : this.api.createBook(payload);
    request.subscribe({
      next: () => {
        this.showBookForm.set(false);
        this.message.set(currentBook ? 'Libro actualizado.' : 'Libro añadido al catálogo.');
        this.loadDashboard();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(this.errorMessage(error, 'No se pudo guardar el libro.'));
      },
      complete: () => this.busy.set(false),
    });
  }

  deleteBook(book: Book): void {
    if (!window.confirm(`¿Eliminar «${book.title}» del catálogo?`)) return;
    this.busy.set(true);
    this.api.deleteBook(book.id).subscribe({
      next: () => {
        this.message.set('Libro eliminado.');
        this.loadDashboard();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(this.errorMessage(error, 'No se pudo eliminar el libro.'));
      },
      complete: () => this.busy.set(false),
    });
  }

  toggleUser(user: LibraryUser): void {
    if (!user.id) return;
    const disabled = Boolean(user.lockoutEnd && Date.parse(user.lockoutEnd) > Date.now());
    this.busy.set(true);
    this.api.setUserEnabled(user.id, disabled).subscribe({
      next: () => {
        this.message.set(disabled ? 'Cuenta habilitada.' : 'Cuenta deshabilitada.');
        this.loadDashboard();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(this.errorMessage(error, 'No se pudo actualizar la cuenta.'));
      },
      complete: () => this.busy.set(false),
    });
  }

  signOut(): void {
    this.clearFeedback();
    this.busy.set(true);
    this.auth.logout().subscribe({
      next: () => this.finishSignOut(),
      error: (error: unknown) => {
        this.finishSignOut();
        this.error.set(
          `La sesión se cerró en este navegador, pero la API notificó un error: ${this.errorMessage(error, 'Error al cerrar sesión.')}`,
        );
      },
      complete: () => this.busy.set(false),
    });
  }

  bookFor(reservation: Reservation): Book | undefined {
    return this.books().find((book) => book.id === reservation.bookId);
  }

  userFor(reservation: Reservation): LibraryUser | undefined {
    return this.users().find((user) => user.id === reservation.userId);
  }

  isUserDisabled(user: LibraryUser): boolean {
    return Boolean(user.lockoutEnd && Date.parse(user.lockoutEnd) > Date.now());
  }

  private loadDashboard(): void {
    const user = this.user();
    if (!user) return;
    this.loading.set(true);
    if (user.role === 'admin') {
      forkJoin({
        books: this.api.books(),
        reservations: this.api.reservations(),
        users: this.api.users(),
      }).subscribe({
        next: ({ books, reservations, users }) => {
          this.books.set(books);
          this.reservations.set(reservations);
          this.users.set(users);
        },
        error: (error: unknown) => this.dashboardError(error),
        complete: () => this.loading.set(false),
      });
      return;
    }

    forkJoin({
      books: this.api.books(),
      reservations: this.api.reservations(user.id),
    }).subscribe({
      next: ({ books, reservations }) => {
        this.books.set(books);
        this.reservations.set(reservations);
      },
      error: (error: unknown) => this.dashboardError(error),
      complete: () => this.loading.set(false),
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
        this.error.set(this.errorMessage(error, 'No se pudo confirmar el correo.'));
      },
      complete: () => this.busy.set(false),
    });
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  private finishSignOut(): void {
    this.user.set(null);
    this.books.set([]);
    this.reservations.set([]);
    this.users.set([]);
    this.selectedRole.set('user');
    this.mode.set('role');
    this.busy.set(false);
  }

  private clearFeedback(): void {
    this.message.set('');
    this.error.set('');
  }

  private dashboardError(error: unknown): void {
    this.loading.set(false);
    this.error.set(this.errorMessage(error, 'No se pudo cargar la biblioteca.'));
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      if (typeof body === 'object' && body !== null && 'detail' in body) {
        const detail = body.detail;
        if (typeof detail === 'string' && detail.trim()) return detail;
      }
      if (typeof body === 'string' && body.trim()) return body;
      if (error.status === 0) {
        return 'No hay conexión con la API. Comprueba que http://localhost:5000 está disponible y permite CORS.';
      }
      return `${fallback} (HTTP ${error.status})`;
    }
    return error instanceof Error ? error.message : fallback;
  }
}
