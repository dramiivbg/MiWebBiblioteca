import { Component, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, Subject } from 'rxjs';
import { Book } from './biblioteca.models';
import { AuthFacade } from '../core/auth.facade';
import { LibraryFacade } from '../core/library.facade';
import { BookCardComponent } from '../shared/book-card.component';
import { DashboardNavItem, DashboardShellComponent } from '../shared/dashboard-shell.component';
import { ReservationTableComponent } from '../shared/reservation-table.component';
import { StatsGridComponent } from '../shared/stats-grid.component';

type UserSection = 'catalog' | 'reservations';

@Component({
  selector: 'app-biblioteca',
  imports: [
    DashboardShellComponent,
    StatsGridComponent,
    BookCardComponent,
    ReservationTableComponent,
  ],
  templateUrl: './biblioteca.component.html',
})
export class BibliotecaComponent implements OnInit {
  readonly auth = inject(AuthFacade);
  readonly library = inject(LibraryFacade);

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('reserveDialog');
  private previousFocus: HTMLElement | null = null;

  readonly section = signal<UserSection>('catalog');
  readonly reservingBook = signal<Book | null>(null);
  readonly returnDate = signal('');
  readonly returnDateError = signal('');
  readonly sections: readonly DashboardNavItem[] = [
    { id: 'catalog', label: 'Explorar libros', icon: '▤' },
    { id: 'reservations', label: 'Mis reservas', icon: '◷' },
  ];

  private readonly searchInput = new Subject<string>();

  constructor() {
    this.searchInput
      .pipe(debounceTime(200), takeUntilDestroyed())
      .subscribe((value) => this.library.setSearch(value));
  }

  ngOnInit(): void {
    void this.library.load('user');
  }

  setSection(section: string): void {
    if (section === 'catalog' || section === 'reservations') {
      this.section.set(section);
    }
    this.library.clearFeedback();
  }

  setSearch(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.searchInput.next(event.target.value);
    }
  }

  reserve(book: Book): void {
    this.previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.reservingBook.set(book);
    this.returnDate.set(this.suggestedReturnDate());
    this.returnDateError.set('');
    this.library.clearFeedback();
    queueMicrotask(() =>
      this.dialog()?.nativeElement.querySelector<HTMLInputElement>('#return-date')?.focus(),
    );
  }

  minimumReturnDate(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.toDateInput(tomorrow);
  }

  updateReturnDate(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.returnDate.set(event.target.value);
      this.returnDateError.set('');
    }
  }

  confirmReserve(): void {
    const book = this.reservingBook();
    const date = this.returnDate();
    if (!book) return;

    if (!date) {
      this.returnDateError.set('Elige una fecha de devolución.');
      return;
    }
    if (date <= this.toDateInput(new Date())) {
      this.returnDateError.set('La fecha de devolución debe ser posterior a hoy.');
      return;
    }

    void this.library.reserve(book, new Date(`${date}T00:00:00Z`).toISOString());
    this.closeReserveDialog();
  }

  closeReserveDialog(): void {
    this.reservingBook.set(null);
    this.previousFocus?.focus();
    this.previousFocus = null;
  }

  onReserveDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeReserveDialog();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialogElement = this.dialog()?.nativeElement;
    if (!dialogElement) return;
    const focusable = Array.from(
      dialogElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href]',
      ),
    );
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === dialogElement)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private suggestedReturnDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return this.toDateInput(date);
  }

  private toDateInput(date: Date): string {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
  }
}
