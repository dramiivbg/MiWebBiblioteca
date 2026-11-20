import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { BibliotecaApiService } from './biblioteca-api.service';
import { bibliotecaErrorMessage } from './biblioteca-error';
import { Book, LibraryUser, Reservation, SessionUser } from './biblioteca.models';

type AdminSection = 'reservations' | 'books' | 'users';

@Component({
  selector: 'app-biblioteca-admin',
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './biblioteca-admin.component.html',
})
export class BibliotecaAdminComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly api = inject(BibliotecaApiService);

  readonly user = input.required<SessionUser>();
  readonly signingOut = input(false);
  readonly signOut = output<void>();
  readonly section = signal<AdminSection>('reservations');
  readonly books = signal<Book[]>([]);
  readonly reservations = signal<Reservation[]>([]);
  readonly users = signal<LibraryUser[]>([]);
  readonly userEnabledOverrides = signal<Record<string, boolean>>({});
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly editingBook = signal<Book | null>(null);
  readonly showBookForm = signal(false);

  readonly activeReservations = computed(
    () => this.reservations().filter((reservation) => !reservation.isReturned).length,
  );
  readonly totalCopies = computed(() =>
    this.books().reduce((total, book) => total + book.stock, 0),
  );

  readonly bookForm = this.formBuilder.group({
    title: ['', Validators.required],
    author: ['', Validators.required],
    description: ['', Validators.required],
    publishedDate: ['', Validators.required],
    stock: [1, [Validators.required, Validators.min(0)]],
    pages: [1, [Validators.required, Validators.min(1)]],
  });

  ngOnInit(): void {
    this.loadDashboard();
  }

  setSection(section: AdminSection): void {
    this.section.set(section);
    this.clearFeedback();
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
        this.error.set(bibliotecaErrorMessage(error, 'No se pudo guardar el libro.'));
      },
      complete: () => this.busy.set(false),
    });
  }

  deleteBook(book: Book): void {
    if (!window.confirm(`¿Eliminar «${book.title}» del catálogo?`)) return;
    this.busy.set(true);
    this.clearFeedback();
    this.api.deleteBook(book.id).subscribe({
      next: () => {
        this.message.set('Libro eliminado.');
        this.loadDashboard();
      },
      error: (error) => {
        this.busy.set(false);
        console.log(error)
        this.error.set(bibliotecaErrorMessage(error, error.error.error));
      },
      complete: () => this.busy.set(false),
    });
  }

  toggleUser(user: LibraryUser): void {
    if (!user.id) return;
    const userId = user.id;
    const shouldEnable = this.isUserDisabled(user);
    this.busy.set(true);
    this.clearFeedback();
    this.api.setUserEnabled(userId, shouldEnable).subscribe({
      next: () => {
        this.userEnabledOverrides.update((overrides) => ({
          ...overrides,
          [userId]: shouldEnable,
        }));
        this.message.set(shouldEnable ? 'Cuenta habilitada.' : 'Cuenta deshabilitada.');
        this.loadDashboard();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(bibliotecaErrorMessage(error, 'No se pudo actualizar la cuenta.'));
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
        this.error.set(bibliotecaErrorMessage(error, 'No se pudo confirmar la devolución.'));
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
    const enabledOverride = user.id ? this.userEnabledOverrides()[user.id] : undefined;
    if (enabledOverride !== undefined) return !enabledOverride;
    return Boolean(user.lockoutEnd && Date.parse(user.lockoutEnd) > Date.now());
  }

  private loadDashboard(): void {
    this.loading.set(true);
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
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(bibliotecaErrorMessage(error, 'No se pudo cargar la biblioteca.'));
      },
      complete: () => this.loading.set(false),
    });
  }

  private clearFeedback(): void {
    this.message.set('');
    this.error.set('');
  }
}
