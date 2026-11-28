import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BibliotecaComponent } from './biblioteca.component';
import { Book, Reservation, SessionUser } from './biblioteca.models';
import { BookRepository } from '../core/book.repository';
import { DashboardRepository } from '../core/dashboard.repository';
import { LibraryFacade } from '../core/library.facade';
import { ReservationRepository } from '../core/reservation.repository';
import { SessionStore } from '../core/session.store';
import { UserRepository } from '../core/user.repository';

describe('BibliotecaComponent return date dialog', () => {
  const book: Book = {
    id: 3,
    title: 'Libro C',
    author: 'Autor C',
    description: 'Una historia.',
    publishedDate: '2026-01-01T00:00:00Z',
    stock: 1,
    pages: 90,
  };
  const user: SessionUser = { id: 'u1', email: 'u1@example.com', name: 'Lector', role: 'user' };

  function dateInput(date: Date): string {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  }

  async function setup() {
    const create = vi.fn((payload: Omit<Reservation, 'id' | 'isReturned'>) =>
      of({ ...payload, id: 11, isReturned: false }),
    );

    await TestBed.configureTestingModule({
      imports: [BibliotecaComponent],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: BookRepository, useValue: { list: vi.fn(() => of([book])) } },
        {
          provide: ReservationRepository,
          useValue: { list: vi.fn(() => of([])), create, markReturned: vi.fn() },
        },
        {
          provide: UserRepository,
          useValue: { list: vi.fn(() => of([])), getById: vi.fn(), setEnabled: vi.fn() },
        },
        { provide: DashboardRepository, useValue: { booksReservations: vi.fn(() => of([])) } },
        { provide: SessionStore, useValue: { user: signal(user) } },
      ],
    }).compileComponents();

    await TestBed.inject(LibraryFacade).load('user');
    const fixture = TestBed.createComponent(BibliotecaComponent);
    fixture.detectChanges();
    return { fixture, create };
  }

  it('opens the dialog with a default date later than today', async () => {
    const { fixture } = await setup();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('.outline-button')?.click();
    fixture.detectChanges();

    const input = element.querySelector<HTMLInputElement>('#return-date');
    const today = dateInput(new Date());
    expect(input?.value).toBeTruthy();
    expect(input!.value > today).toBe(true);
    expect(input!.min > today).toBe(true);
    expect(element.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
  });

  it('rejects a return date that is not later than today', async () => {
    const { fixture, create } = await setup();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('.outline-button')?.click();
    fixture.detectChanges();

    const input = element.querySelector<HTMLInputElement>('#return-date');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    input!.value = dateInput(yesterday);
    input!.dispatchEvent(new Event('input'));
    element
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(create).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('posterior a hoy');
    expect(element.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('reserves the book with the chosen date and closes the dialog', async () => {
    const { fixture, create } = await setup();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('.outline-button')?.click();
    fixture.detectChanges();

    const input = element.querySelector<HTMLInputElement>('#return-date');
    const future = new Date();
    future.setDate(future.getDate() + 9);
    input!.value = dateInput(future);
    input!.dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('[type="submit"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].dueDate).toContain(dateInput(future));
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });
});
