import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination-controls',
  template: `
    <div class="chart-pagination">
      <span class="chart-page-label">Página {{ page() }} de {{ pageCount() }}</span>
      <div class="chart-page-controls">
        <button
          class="chart-page-button"
          type="button"
          [disabled]="page() <= 1"
          [attr.aria-label]="previousLabel()"
          (click)="previous.emit()"
        >
          ↑
        </button>
        <button
          class="chart-page-button"
          type="button"
          [disabled]="page() >= pageCount()"
          [attr.aria-label]="nextLabel()"
          (click)="next.emit()"
        >
          ↓
        </button>
      </div>
    </div>
  `,
})
export class PaginationControlsComponent {
  readonly page = input.required<number>();
  readonly pageCount = input.required<number>();
  readonly previousLabel = input('Ver registros anteriores');
  readonly nextLabel = input('Ver más registros');
  readonly previous = output<void>();
  readonly next = output<void>();
}
