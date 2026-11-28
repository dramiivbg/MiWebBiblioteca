import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Book, Reservation, SessionUser, TopBook } from '../Biblioteca/biblioteca.models';
import { BookRepository } from './book.repository';
import { DashboardRepository } from './dashboard.repository';
import { LibraryFacade } from './library.facade';
import { ReservationRepository } from './reservation.repository';
import { SessionStore } from './session.store';
import { UserRepository } from './user.repository';

describe('LibraryFacade topBooks reactivity', () => {
  const book: Book = {
    id: 1,
    title: 'Libro A',
    author: 'Autor A',
    description: '',
    publishedDate: '2026-01-01T00:00:00Z',
    stock: 2,
    pages: 100,
  };
  const reservation: Reservation = {
    id: 7,
    userId: 'u1',
    bookId: 1,
    reservationDate: '2026-01-01T00:00:00Z',
    dueDate: '2026-01-15T00:00:00Z',
    isReturned: false,
  };
  const stats: TopBook[] = [
    {
      bookId: 1,
      title: 'Libro A',
      author: 'Autor A',
      totalReservations: 1,
      reservations: [
        {
          id: 7,
          userId: 'u1',
          userName: 'ana',
          fullName: 'Ana Pérez',
          email: 'ana@example.com',
          reservationDate: reservation.reservationDate,
          dueDate: reservation.dueDate,
          isReturned: false,
        },
      ],
    },
  ];

  it('reflects a confirmed return in the statistics ranking', async () => {
    const markReturned = vi.fn(() => of({ ...reservation, isReturned: true }));

    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: BookRepository, useValue: { list: vi.fn(() => of([book])) } },
        {
          provide: ReservationRepository,
          useValue: { list: vi.fn(() => of([reservation])), markReturned },
        },
        {
          provide: UserRepository,
          useValue: {
            list: vi.fn(() => of([])),
            getById: vi.fn(() => of(null)),
            setEnabled: vi.fn(),
          },
        },
        { provide: DashboardRepository, useValue: { booksReservations: vi.fn(() => of(stats)) } },
      ],
    }).compileComponents();

    const facade = TestBed.inject(LibraryFacade);
    await facade.load('admin');
    await facade.loadTopBooks();

    expect(facade.topBooks()[0].reservations[0].isReturned).toBe(false);

    await facade.returnBook(reservation);

    expect(markReturned).toHaveBeenCalledWith(reservation.id);
    expect(facade.topBooks()[0].reservations[0].isReturned).toBe(true);
  });
});

describe('LibraryFacade reserve due date', () => {
  const book: Book = {
    id: 2,
    title: 'Libro B',
    author: 'Autor B',
    description: '',
    publishedDate: '2026-01-01T00:00:00Z',
    stock: 1,
    pages: 80,
  };
  const user: SessionUser = { id: 'u1', email: 'u1@example.com', name: 'Lector', role: 'user' };

  function setup(create: ReturnType<typeof vi.fn>) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: BookRepository, useValue: { list: vi.fn(() => of([book])) } },
        {
          provide: ReservationRepository,
          useValue: {
            list: vi.fn(() => of([])),
            create,
            markReturned: vi.fn(),
          },
        },
        {
          provide: UserRepository,
          useValue: { list: vi.fn(() => of([])), getById: vi.fn(), setEnabled: vi.fn() },
        },
        { provide: DashboardRepository, useValue: { booksReservations: vi.fn(() => of([])) } },
        { provide: SessionStore, useValue: { user: signal(user) } },
      ],
    });
    return TestBed.inject(LibraryFacade);
  }

  it('sends the chosen return date and includes it in the confirmation', async () => {
    const create = vi.fn((payload: Omit<Reservation, 'id' | 'isReturned'>) =>
      of({ ...payload, id: 9, isReturned: false }),
    );
    const facade = setup(create);

    await facade.reserve(book, '2030-05-20T00:00:00Z');

    expect(create.mock.calls[0][0].dueDate).toContain('2030-05-20');
    expect(facade.message()).toContain('20 de mayo de 2030');
  });

  it('falls back to a future date when the requested date is in the past', async () => {
    const create = vi.fn((payload: Omit<Reservation, 'id' | 'isReturned'>) =>
      of({ ...payload, id: 10, isReturned: false }),
    );
    const facade = setup(create);

    await facade.reserve(book, '2020-01-01T00:00:00Z');

    expect(Date.parse(create.mock.calls[0][0].dueDate)).toBeGreaterThan(Date.now());
  });
});
