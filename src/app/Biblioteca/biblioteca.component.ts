import { Component, inject, OnInit, signal } from '@angular/core';
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

  readonly section = signal<UserSection>('catalog');
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
    void this.library.reserve(book);
  }
}
