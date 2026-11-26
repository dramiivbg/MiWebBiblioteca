import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { Book } from '../Biblioteca/biblioteca.models';

@Component({
  selector: 'app-book-card',
  imports: [DatePipe],
  template: `
    <article class="book-card">
      <div [class]="'book-cover ' + coverClass()">
        <span class="cover-kicker">BIBLIOTECA · {{ book().publishedDate | date: 'yyyy' }}</span>
        <span class="cover-title">{{ book().title }}</span>
        <span class="cover-author">{{ book().author }}</span>
        <span class="cover-ornament" aria-hidden="true">✳</span>
      </div>
      <div class="book-info">
        <div class="book-meta">
          <span>{{ book().pages }} páginas</span>
          <span [class.stock-empty]="book().stock < 1">
            {{ book().stock > 0 ? 'Disponible' : 'Agotado' }}
          </span>
        </div>
        <h3>{{ book().title }}</h3>
        <p>{{ book().author }}</p>
        <p class="book-description">{{ book().description }}</p>
        <button
          class="outline-button"
          type="button"
          [disabled]="book().stock < 1 || busy()"
          (click)="reserve.emit(book())"
        >
          {{ book().stock > 0 ? 'Reservar libro' : 'Sin ejemplares' }}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </article>
  `,
})
export class BookCardComponent {
  readonly book = input.required<Book>();
  readonly variant = input(0);
  readonly busy = input(false);
  readonly reserve = output<Book>();

  readonly coverClass = computed(
    () => ['cover-lilac', 'cover-sage', 'cover-rose', 'cover-gold'][this.variant() % 4],
  );
}
