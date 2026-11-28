import { DatePipe } from '@angular/common';
import { Component, computed, ElementRef, inject, input, signal } from '@angular/core';
import { TopBook } from '../Biblioteca/biblioteca.models';
import { PaginationControlsComponent } from './pagination-controls.component';

const SEGMENT_COLORS = ['#725d9c', '#b27b51', '#68856e', '#5f7f9c', '#a85f78'];
const RADIUS = 72;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const PAGE_SIZE = 5;

interface ChartSegment {
  key: string;
  book: TopBook;
  color: string;
  dashArray: string;
  dashOffset: number;
}

@Component({
  selector: 'app-top-books-chart',
  imports: [DatePipe, PaginationControlsComponent],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'clear()',
  },
  template: `
    @if (loading()) {
      <div class="loading-state" role="status"><span class="spinner"></span> Cargando ranking…</div>
    } @else if (error()) {
      <div class="empty-state" role="alert">
        <span aria-hidden="true">!</span>
        <h3>No pudimos cargar la gráfica</h3>
        <p>{{ error() }}</p>
      </div>
    } @else if (!books().length) {
      <div class="empty-state">
        <span aria-hidden="true">▤</span>
        <h3>Aún no hay reservas.</h3>
        <p>Los libros más reservados aparecerán aquí.</p>
      </div>
    } @else {
      <div class="donut-layout">
        <ol class="chart-legend" aria-label="Cinco libros más reservados">
          @for (segment of segments(); track segment.key) {
            <li
              class="legend-row"
              (mouseenter)="activate(segment.book)"
              (focusin)="activate(segment.book)"
            >
              <button
                class="legend-button"
                type="button"
                [attr.aria-expanded]="activeKey() === segment.key"
                [attr.aria-describedby]="
                  activeKey() === segment.key ? tooltipId(segment.book) : null
                "
                [attr.aria-label]="chartLabel(segment.book)"
                (click)="activate(segment.book)"
              >
                <span
                  class="legend-dot"
                  [style.background]="segment.color"
                  aria-hidden="true"
                ></span>
                <span class="legend-book">
                  <strong>{{ segment.book.title }}</strong>
                  <small class="table-subtext">{{ segment.book.author }}</small>
                </span>
                <span class="legend-value">
                  <strong>{{ segment.book.totalReservations }}</strong>
                  <small>{{ segment.book.totalReservations === 1 ? 'reserva' : 'reservas' }}</small>
                </span>
              </button>
            </li>
          }
        </ol>

        <div class="donut-wrap">
          <svg class="donut" viewBox="0 0 200 200" aria-hidden="true">
            <circle class="donut-track" cx="100" cy="100" r="72" />
            @for (segment of segments(); track segment.key) {
              <circle
                class="donut-segment"
                [class.faded]="activeKey() !== null && activeKey() !== segment.key"
                cx="100"
                cy="100"
                r="72"
                transform="rotate(-90 100 100)"
                [attr.stroke]="segment.color"
                [attr.stroke-dasharray]="segment.dashArray"
                [attr.stroke-dashoffset]="segment.dashOffset"
                (mouseenter)="activate(segment.book)"
                (click)="activate(segment.book)"
              />
            }
          </svg>
          <div class="donut-center" aria-hidden="true">
            <strong>{{ totalReservations() }}</strong>
            <small>reservas</small>
          </div>
        </div>
      </div>

      @if (activeBook(); as book) {
        <div
          class="chart-tooltip"
          [id]="tooltipId(book)"
          role="region"
          [attr.aria-label]="'Reservas de ' + book.title"
        >
          <p class="chart-tooltip-title">
            <span
              class="tooltip-dot"
              [style.background]="segmentColor(book)"
              aria-hidden="true"
            ></span>
            {{ book.title }} · {{ book.totalReservations }}
            {{ book.totalReservations === 1 ? 'reserva' : 'reservas' }}
          </p>
          @if (book.reservations.length) {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">LECTOR</th>
                    <th scope="col">RESERVADO EL</th>
                    <th scope="col">DEVOLUCIÓN</th>
                    <th scope="col">ESTADO</th>
                  </tr>
                </thead>
                <tbody>
                  @for (reservation of visibleReservations(); track $index) {
                    <tr>
                      <td>
                        <strong>{{
                          reservation.userName || reservation.fullName || 'Usuario'
                        }}</strong>
                        <small class="table-subtext">
                          {{
                            reservation.email ||
                              reservation.fullName ||
                              reservation.userId ||
                              'Usuario'
                          }}
                        </small>
                      </td>
                      <td>{{ reservation.reservationDate | date: 'd MMM y' }}</td>
                      <td>{{ reservation.dueDate | date: 'd MMM y' }}</td>
                      <td>
                        <span class="status-pill" [class.returned]="reservation.isReturned">
                          {{ reservation.isReturned ? 'Devuelto' : 'En préstamo' }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (book.reservations.length > pageSize) {
              <app-pagination-controls
                [page]="currentPage() + 1"
                [pageCount]="pageCount()"
                previousLabel="Ver reservas anteriores"
                nextLabel="Ver más reservas"
                (previous)="previousPage()"
                (next)="nextPage()"
              />
            }
          } @else {
            <p class="chart-tooltip-empty">No hay detalle disponible de estas reservas.</p>
          }
        </div>
      }
    }
  `,
})
export class TopBooksChartComponent {
  readonly books = input.required<readonly TopBook[]>();
  readonly loading = input(false);
  readonly error = input('');

  private readonly element = inject(ElementRef<HTMLElement>);
  readonly pageSize = PAGE_SIZE;
  readonly activeKey = signal<string | null>(null);

  private readonly pageIndex = signal(0);
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.activeBook()?.reservations.length ?? 0) / PAGE_SIZE)),
  );
  readonly currentPage = computed(() => Math.min(this.pageIndex(), this.pageCount() - 1));
  readonly visibleReservations = computed(() => {
    const start = this.currentPage() * PAGE_SIZE;
    return this.activeBook()?.reservations.slice(start, start + PAGE_SIZE) ?? [];
  });

  readonly totalReservations = computed(() =>
    this.books().reduce((total, book) => total + book.totalReservations, 0),
  );

  readonly segments = computed<ChartSegment[]>(() => {
    const books = this.books();
    const total = this.totalReservations();
    let offset = 0;

    return books.map((book, index) => {
      const fraction = total > 0 ? book.totalReservations / total : 0;
      const visibleLength = Math.max(fraction * CIRCUMFERENCE - 2, 0.5);
      const dashOffset = -offset * CIRCUMFERENCE;
      offset += fraction;

      return {
        key: this.key(book),
        book,
        color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
        dashArray: `${visibleLength} ${CIRCUMFERENCE - visibleLength}`,
        dashOffset,
      };
    });
  });

  readonly activeBook = computed(() => {
    const key = this.activeKey();
    return this.books().find((book) => this.key(book) === key) ?? null;
  });

  key(book: TopBook): string {
    return book.bookId > 0 ? String(book.bookId) : book.title;
  }

  chartLabel(book: TopBook): string {
    const count = `${book.totalReservations} ${book.totalReservations === 1 ? 'reserva' : 'reservas'}`;
    return `${book.title}, ${count}. Ver detalle de las reservas`;
  }

  tooltipId(book: TopBook): string {
    return `chart-tooltip-${this.key(book).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  segmentColor(book: TopBook): string {
    return (
      this.segments().find((segment) => segment.key === this.key(book))?.color ?? SEGMENT_COLORS[0]
    );
  }

  activate(book: TopBook): void {
    const key = this.key(book);
    if (this.activeKey() !== key) this.pageIndex.set(0);
    this.activeKey.set(key);
  }

  onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.element.nativeElement.contains(target)) return;

    const card = this.element.nativeElement.closest('.content-panel');
    if (card?.contains(target)) return;

    this.clear();
  }

  nextPage(): void {
    this.pageIndex.update((page) => Math.min(page + 1, this.pageCount() - 1));
  }

  previousPage(): void {
    this.pageIndex.update((page) => Math.max(page - 1, 0));
  }

  clear(): void {
    this.activeKey.set(null);
    this.pageIndex.set(0);
  }
}
