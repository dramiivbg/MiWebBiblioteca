import { Component, input } from '@angular/core';

@Component({
  selector: 'app-stats-grid',
  template: `
    <section class="stats-grid" aria-label="Resumen de la biblioteca">
      <article class="stat-card">
        <span class="stat-icon lavender" aria-hidden="true">▤</span>
        <span class="stat-copy"><small>LIBROS EN CATÁLOGO</small><strong>{{ bookCount() }}</strong></span>
        <span class="stat-caption">en la biblioteca</span>
      </article>
      <article class="stat-card">
        <span class="stat-icon peach" aria-hidden="true">◷</span>
        <span class="stat-copy"><small>PRÉSTAMOS ACTIVOS</small><strong>{{ activeLoans() }}</strong></span>
        <span class="stat-caption">pendientes de devolución</span>
      </article>
      <article class="stat-card">
        <span class="stat-icon mint" aria-hidden="true">▥</span>
        <span class="stat-copy"><small>EJEMPLARES DISPONIBLES</small><strong>{{ totalCopies() }}</strong></span>
        <span class="stat-caption">listos para reservar</span>
      </article>
    </section>
  `,
})
export class StatsGridComponent {
  readonly bookCount = input.required<number>();
  readonly activeLoans = input.required<number>();
  readonly totalCopies = input.required<number>();
}
