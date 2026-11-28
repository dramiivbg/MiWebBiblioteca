import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TopBook } from '../Biblioteca/biblioteca.models';
import { TopBooksChartComponent } from './top-books-chart.component';

describe('TopBooksChartComponent', () => {
  const books: TopBook[] = [
    {
      bookId: 1,
      title: 'Libro A',
      author: 'Autor A',
      totalReservations: 2,
      reservations: [
        {
          id: 1,
          userId: 'u1',
          userName: 'ana',
          fullName: 'Ana Pérez',
          email: 'ana@example.com',
          reservationDate: '2026-01-01T00:00:00Z',
          dueDate: '2026-01-15T00:00:00Z',
          isReturned: false,
        },
        {
          id: 2,
          userId: 'u2',
          userName: 'luis',
          fullName: 'Luis Gómez',
          email: 'luis@example.com',
          reservationDate: '2026-02-01T00:00:00Z',
          dueDate: '2026-02-15T00:00:00Z',
          isReturned: true,
        },
      ],
    },
  ];

  it('shows the reservations and readers while hovering a legend color', async () => {
    await TestBed.configureTestingModule({ imports: [TopBooksChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TopBooksChartComponent);
    fixture.componentRef.setInput('books', books);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.chart-tooltip')).toBeNull();

    element.querySelector('.legend-row')?.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    const tooltip = element.querySelector('[role="region"]');
    expect(tooltip?.textContent).toContain('ana');
    expect(tooltip?.textContent).toContain('luis');
    expect(tooltip?.textContent).toContain('En préstamo');
    expect(tooltip?.textContent).toContain('Devuelto');
  });

  it('exposes the tooltip through aria-describedby when the legend item is focused', async () => {
    await TestBed.configureTestingModule({ imports: [TopBooksChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TopBooksChartComponent);
    fixture.componentRef.setInput('books', books);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector<HTMLButtonElement>('.legend-button');
    button?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    fixture.detectChanges();

    const tooltip = element.querySelector<HTMLElement>('[role="region"]');
    expect(tooltip?.id).toBeTruthy();
    expect(button?.getAttribute('aria-describedby')).toBe(tooltip?.id);
    expect(button?.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps the list open after the mouse leaves and closes it on an outside click', async () => {
    await TestBed.configureTestingModule({ imports: [TopBooksChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TopBooksChartComponent);
    fixture.componentRef.setInput('books', books);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    element.querySelector('.legend-row')?.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    element.querySelector('.donut-layout')?.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(element.querySelector('[role="region"]')).not.toBeNull();

    document.body.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="region"]')).toBeNull();
  });

  it('draws one colored donut segment per book and opens its reservations on hover', async () => {
    const fiveBooks = Array.from({ length: 5 }, (_, index) => ({
      ...books[0],
      bookId: index + 1,
      title: `Libro ${index + 1}`,
      totalReservations: index + 1,
    }));

    await TestBed.configureTestingModule({ imports: [TopBooksChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TopBooksChartComponent);
    fixture.componentRef.setInput('books', fiveBooks);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const segments = Array.from(element.querySelectorAll<SVGCircleElement>('.donut-segment'));
    expect(segments).toHaveLength(5);
    expect(new Set(segments.map((segment) => segment.getAttribute('stroke'))).size).toBe(5);

    segments[0].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(element.querySelector('[role="region"]')?.textContent).toContain('Libro 1');
    expect(element.querySelector('.donut-center')?.textContent).toContain('15');
  });

  it('paginates the reservation list five rows at a time', async () => {
    const manyReservations = Array.from({ length: 7 }, (_, index) => ({
      ...books[0].reservations[0],
      id: index + 1,
      userId: `u${index + 1}`,
      userName: `Lector ${index + 1}`,
    }));
    const bookWithManyReservations: TopBook = {
      ...books[0],
      totalReservations: manyReservations.length,
      reservations: manyReservations,
    };

    await TestBed.configureTestingModule({ imports: [TopBooksChartComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TopBooksChartComponent);
    fixture.componentRef.setInput('books', [bookWithManyReservations]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    element.querySelector('.legend-row')?.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    const rows = () => Array.from(element.querySelectorAll('.chart-tooltip tbody tr'));
    expect(rows()).toHaveLength(5);
    expect(element.querySelector('.chart-page-label')?.textContent).toContain('Página 1 de 2');

    element.querySelector<HTMLButtonElement>('[aria-label="Ver más reservas"]')?.click();
    fixture.detectChanges();

    expect(element.querySelector('.chart-page-label')?.textContent).toContain('Página 2 de 2');
    expect(rows()[0].textContent).toContain('Lector 6');
    expect(
      element.querySelector<HTMLButtonElement>('[aria-label="Ver más reservas"]')?.disabled,
    ).toBe(true);
  });
});
