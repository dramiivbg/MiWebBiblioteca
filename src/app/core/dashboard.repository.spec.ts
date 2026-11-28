import { describe, expect, it } from 'vitest';
import { toTopBooks } from './dashboard.repository';

describe('toTopBooks', () => {
  it('groups reservations and keeps only the five most reserved books', () => {
    const stats = toTopBooks([
      { bookId: 1, title: 'Libro A', totalReservations: 7 },
      { bookId: 2, title: 'Libro B', totalReservations: 2 },
      { bookId: 3, title: 'Libro C', totalReservations: 1 },
      {
        bookId: 4,
        title: 'Libro D',
        totalReservations: 3,
        reservations: [
          {
            userId: 'u1',
            userName: 'ana',
            reservationDate: '2026-01-01T00:00:00Z',
            dueDate: '2026-01-15T00:00:00Z',
            isReturned: false,
          },
        ],
      },
      { bookId: 5, title: 'Libro E', totalReservations: 4 },
      { bookId: 6, title: 'Libro F', totalReservations: 9 },
    ]);

    expect(stats.map((stat) => stat.title)).toEqual([
      'Libro F',
      'Libro A',
      'Libro E',
      'Libro D',
      'Libro B',
    ]);
    const libroD = stats.find((stat) => stat.title === 'Libro D');
    expect(libroD?.reservations[0].userName).toBe('ana');
    expect(libroD?.reservations[0].isReturned).toBe(false);
  });

  it('normalizes flat reservation rows into grouped books', () => {
    const stats = toTopBooks([
      {
        bookId: 10,
        title: 'Quijote',
        userId: 'u1',
        fullName: 'Ana Pérez',
        email: 'ana@example.com',
        reservationDate: '2026-01-02T00:00:00Z',
        dueDate: '2026-01-16T00:00:00Z',
        isReturned: true,
      },
      {
        bookId: 10,
        title: 'Quijote',
        userId: 'u2',
        userName: 'luis',
        reservationDate: '2026-02-02T00:00:00Z',
        dueDate: '2026-02-16T00:00:00Z',
        isReturned: false,
      },
    ]);

    expect(stats).toHaveLength(1);
    expect(stats[0].totalReservations).toBe(2);
    expect(
      stats[0].reservations.map((reservation) => reservation.fullName || reservation.userName),
    ).toEqual(['Ana Pérez', 'luis']);
  });
});
