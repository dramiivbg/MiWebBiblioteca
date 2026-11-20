import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { BibliotecaApiService } from './biblioteca-api.service';
import { bibliotecaErrorMessage } from './biblioteca-error';
import { Book, Reservation, SessionUser } from './biblioteca.models';

type UserSection = 'catalog' | 'reservations';

@Component({
  selector: 'app-biblioteca',
  imports: [DatePipe],
  templateUrl: './biblioteca.component.html',
})
export class BibliotecaComponent implements OnInit {
  private readonly api = inject(BibliotecaApiService);

  readonly user = input.required<SessionUser>();
  readonly signingOut = input(false);
  readonly signOut = output<void>();
  readonly section = signal<UserSection>('catalog');
  readonly books = signal<Book[]>([]);
  readonly reservations = signal<Reservation[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly search = signal('');

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

  ngOnInit(): void {
    this.loadDashboard();
  }

  setSection(section: UserSection): void {
    this.section.set(section);
    this.clearFeedback();
  }

  setSearch(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.search.set(event.target.value);
    }
  }

  bookFor(reservation: Reservation): Book | undefined {
    return this.books().find((book) => book.id === reservation.bookId);
  }

  reserve(book: Book): void {
    if (book.stock < 1) return;

    const reservationDate = new Date();
    const dueDate = new Date(reservationDate);
    dueDate.setDate(dueDate.getDate() + 14);
    this.busy.set(true);
    this.clearFeedback();
    this.api
      .createReservation({
        userId: this.user().id,
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
          this.error.set(bibliotecaErrorMessage(error, 'No se pudo reservar el libro.'));
        },
        complete: () => this.busy.set(false),
      });
  }

  private loadDashboard(): void {
    this.loading.set(true);
    forkJoin({
      books: this.api.books(),
      reservations: this.api.reservations(this.user().id),
    }).subscribe({
      next: ({ books, reservations }) => {
        this.books.set(books);
        this.reservations.set(reservations);
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
