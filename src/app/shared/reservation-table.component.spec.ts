import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Reservation } from '../Biblioteca/biblioteca.models';
import { ReservationTableComponent } from './reservation-table.component';

describe('ReservationTableComponent pagination', () => {
  const reservations: Reservation[] = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    userId: `u${index + 1}`,
    bookId: index + 1,
    reservationDate: '2026-01-01T00:00:00Z',
    dueDate: '2026-01-15T00:00:00Z',
    isReturned: false,
  }));

  it('shows ten reservations per page and lets the reader see the rest', async () => {
    await TestBed.configureTestingModule({
      imports: [ReservationTableComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ReservationTableComponent);
    fixture.componentRef.setInput('reservations', reservations);
    fixture.componentRef.setInput('booksById', new Map());
    fixture.componentRef.setInput('usersById', new Map());
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const rows = () => Array.from(element.querySelectorAll('tbody tr'));
    expect(rows()).toHaveLength(10);
    expect(element.querySelector('.chart-page-label')?.textContent).toContain('Página 1 de 2');

    element.querySelector<HTMLButtonElement>('[aria-label="Ver más reservas"]')?.click();
    fixture.detectChanges();

    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain('Libro #11');
    expect(element.querySelector('.chart-page-label')?.textContent).toContain('Página 2 de 2');
  });
});
