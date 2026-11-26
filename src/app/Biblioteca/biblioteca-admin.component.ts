import { DatePipe } from '@angular/common';
import { Component, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Book, LibraryUser, Reservation } from './biblioteca.models';
import { AuthFacade } from '../core/auth.facade';
import { LibraryFacade } from '../core/library.facade';
import { DashboardNavItem, DashboardShellComponent } from '../shared/dashboard-shell.component';
import { ReservationTableComponent } from '../shared/reservation-table.component';
import { StatsGridComponent } from '../shared/stats-grid.component';

type AdminSection = 'reservations' | 'books' | 'users';

@Component({
  selector: 'app-biblioteca-admin',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    DashboardShellComponent,
    ReservationTableComponent,
    StatsGridComponent,
  ],
  templateUrl: './biblioteca-admin.component.html',
})
export class BibliotecaAdminComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('bookDialog');
  private previousFocus: HTMLElement | null = null;

  readonly auth = inject(AuthFacade);
  readonly library = inject(LibraryFacade);

  readonly section = signal<AdminSection>('reservations');
  readonly sections: readonly DashboardNavItem[] = [
    { id: 'reservations', label: 'Reservas', icon: '◷' },
    { id: 'books', label: 'Catálogo', icon: '▤' },
    { id: 'users', label: 'Usuarios', icon: '♙' },
  ];
  readonly editingBook = signal<Book | null>(null);
  readonly showBookForm = signal(false);

  readonly bookForm = this.formBuilder.group({
    title: ['', Validators.required],
    author: ['', Validators.required],
    description: ['', Validators.required],
    publishedDate: ['', Validators.required],
    stock: [1, [Validators.required, Validators.min(0)]],
    pages: [1, [Validators.required, Validators.min(1)]],
  });

  ngOnInit(): void {
    void this.library.load('admin');
  }

  setSection(section: string): void {
    if (section === 'reservations' || section === 'books' || section === 'users') {
      this.section.set(section);
    }
    this.library.clearFeedback();
  }

  openNewBook(): void {
    this.startBookForm(null, {
      title: '',
      author: '',
      description: '',
      publishedDate: new Date().toISOString().slice(0, 10),
      stock: 1,
      pages: 1,
    });
  }

  editBook(book: Book): void {
    this.startBookForm(book, {
      title: book.title,
      author: book.author,
      description: book.description,
      publishedDate: book.publishedDate.slice(0, 10),
      stock: book.stock,
      pages: book.pages,
    });
  }

  async saveBook(): Promise<void> {
    this.bookForm.markAllAsTouched();
    if (this.bookForm.invalid) return;

    const values = this.bookForm.getRawValue();
    const payload: Omit<Book, 'id'> = {
      title: values.title,
      author: values.author,
      description: values.description,
      publishedDate: new Date(`${values.publishedDate}T00:00:00Z`).toISOString(),
      stock: Number(values.stock),
      pages: Number(values.pages),
    };

    if (await this.library.saveBook(this.editingBook(), payload)) {
      this.closeBookForm();
    }
  }

  deleteBook(book: Book): void {
    if (!window.confirm(`¿Eliminar «${book.title}» del catálogo?`)) return;
    void this.library.deleteBook(book);
  }

  toggleUser(user: LibraryUser): void {
    void this.library.toggleUser(user);
  }

  returnBook(reservation: Reservation): void {
    void this.library.returnBook(reservation);
  }

  isUserDisabled(user: LibraryUser): boolean {
    return this.library.isUserDisabled(user);
  }

  closeBookForm(): void {
    this.showBookForm.set(false);
    this.previousFocus?.focus();
    this.previousFocus = null;
  }

  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeBookForm();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialogElement = this.dialog()?.nativeElement;
    if (!dialogElement) return;
    const focusable = Array.from(
      dialogElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href]',
      ),
    );
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogElement)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private startBookForm(
    book: Book | null,
    values: {
      title: string;
      author: string;
      description: string;
      publishedDate: string;
      stock: number;
      pages: number;
    },
  ): void {
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.editingBook.set(book);
    this.bookForm.reset(values);
    this.showBookForm.set(true);
    queueMicrotask(() => this.dialog()?.nativeElement.focus());
  }
}
