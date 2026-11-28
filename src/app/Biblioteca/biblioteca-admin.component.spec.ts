import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { BibliotecaAdminComponent } from './biblioteca-admin.component';
import { Book, LibraryUser } from './biblioteca.models';
import { BookRepository } from '../core/book.repository';
import { DashboardRepository } from '../core/dashboard.repository';
import { ReservationRepository } from '../core/reservation.repository';
import { LibraryFacade } from '../core/library.facade';
import { UserRepository } from '../core/user.repository';

describe('BibliotecaAdminComponent', () => {
  const users: LibraryUser[] = [
    {
      id: 'disabled-user',
      address: '',
      userName: 'reader-one',
      email: 'reader-one@example.com',
      emailConfirmed: false,
      phoneNumber: '',
      role: 0,
      phoneNumberConfirmed: false,
      lockoutEnd: '9999-12-31T23:59:59.999Z',
      lockoutEnabled: true,
      accessFailedCount: 0,
      fullName: 'Reader One',
    },
    {
      id: 'active-user',
      address: '',
      userName: 'reader-two',
      email: 'reader-two@example.com',
      emailConfirmed: true,
      phoneNumber: '',
      role: 0,
      phoneNumberConfirmed: false,
      lockoutEnd: null,
      lockoutEnabled: true,
      accessFailedCount: 0,
      fullName: 'Reader Two',
    },
  ];

  it('updates account status and action labels while displaying email confirmation from emailConfirmed', async () => {
    const setUserEnabled = vi.fn(() => of<void>(undefined));

    await TestBed.configureTestingModule({
      imports: [BibliotecaAdminComponent],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: BookRepository, useValue: { list: vi.fn(() => of([])) } },
        { provide: ReservationRepository, useValue: { list: vi.fn(() => of([])) } },
        {
          provide: UserRepository,
          useValue: {
            list: vi.fn(() => of(users)),
            getById: vi.fn(() => of(users[0])),
            setEnabled: setUserEnabled,
          },
        },
      ],
    }).compileComponents();

    await TestBed.inject(LibraryFacade).load('admin');

    const fixture = TestBed.createComponent(BibliotecaAdminComponent);
    fixture.componentInstance.setSection('users');
    fixture.detectChanges();

    const rows = () =>
      Array.from(fixture.nativeElement.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
    expect(rows()[0].textContent).toContain('Deshabilitado');
    expect(rows()[0].textContent).toContain('Habilitar');
    expect(rows()[0].textContent).toContain('Pendiente');
    expect(rows()[1].textContent).toContain('Activo');
    expect(rows()[1].textContent).toContain('Deshabilitar');
    expect(rows()[1].textContent).toContain('Verificado');

    rows()[0].querySelector('button')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(setUserEnabled).toHaveBeenCalledWith('disabled-user', true);
    expect(rows()[0].textContent).toContain('Activo');
    expect(rows()[0].textContent).toContain('Deshabilitar');
    expect(rows()[0].textContent).toContain('Pendiente');

    rows()[1].querySelector('button')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(setUserEnabled).toHaveBeenCalledWith('active-user', false);
    expect(rows()[1].textContent).toContain('Deshabilitado');
    expect(rows()[1].textContent).toContain('Habilitar');
    expect(rows()[1].textContent).toContain('Verificado');
  });

  it('loads the reader by id when the reservations only contain a userId', async () => {
    const getById = vi.fn(() =>
      of({ ...users[1], id: 'missing-user', userName: 'reader-three', fullName: 'Reader Three' }),
    );

    await TestBed.configureTestingModule({
      imports: [BibliotecaAdminComponent],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: BookRepository, useValue: { list: vi.fn(() => of([])) } },
        {
          provide: ReservationRepository,
          useValue: {
            list: vi.fn(() =>
              of([
                {
                  id: 1,
                  userId: 'missing-user',
                  bookId: 1,
                  reservationDate: '2026-01-01T00:00:00Z',
                  dueDate: '2026-01-15T00:00:00Z',
                  isReturned: false,
                },
              ]),
            ),
          },
        },
        {
          provide: UserRepository,
          useValue: { list: vi.fn(() => of([])), getById, setEnabled: vi.fn() },
        },
      ],
    }).compileComponents();

    await TestBed.inject(LibraryFacade).load('admin');

    const fixture = TestBed.createComponent(BibliotecaAdminComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getById).toHaveBeenCalledWith('missing-user');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('reader-three');
  });

  it('paginates the catalog and users lists in groups of ten', async () => {
    const books: Book[] = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      title: `Libro ${index + 1}`,
      author: 'Autor',
      description: '',
      publishedDate: '2026-01-01T00:00:00Z',
      stock: 1,
      pages: 100,
    }));
    const manyUsers: LibraryUser[] = Array.from({ length: 12 }, (_, index) => ({
      ...users[1],
      id: `user-${index}`,
      fullName: `Lector ${index + 1}`,
    }));

    await TestBed.configureTestingModule({
      imports: [BibliotecaAdminComponent],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: BookRepository, useValue: { list: vi.fn(() => of(books)) } },
        { provide: ReservationRepository, useValue: { list: vi.fn(() => of([])) } },
        {
          provide: UserRepository,
          useValue: {
            list: vi.fn(() => of(manyUsers)),
            getById: vi.fn(() => of(null)),
            setEnabled: vi.fn(),
          },
        },
        { provide: DashboardRepository, useValue: { booksReservations: vi.fn(() => of([])) } },
      ],
    }).compileComponents();

    await TestBed.inject(LibraryFacade).load('admin');
    const fixture = TestBed.createComponent(BibliotecaAdminComponent);
    const element = fixture.nativeElement as HTMLElement;
    const rows = () => Array.from(element.querySelectorAll('tbody tr'));

    fixture.componentInstance.setSection('books');
    fixture.detectChanges();
    expect(rows()).toHaveLength(10);
    expect(element.querySelector('.chart-page-label')?.textContent).toContain('Página 1 de 2');
    element.querySelector<HTMLButtonElement>('[aria-label="Ver más libros"]')?.click();
    fixture.detectChanges();
    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain('Libro 11');

    fixture.componentInstance.setSection('users');
    fixture.detectChanges();
    expect(rows()).toHaveLength(10);
    expect(element.querySelector('.chart-page-label')?.textContent).toContain('Página 1 de 2');
    element.querySelector<HTMLButtonElement>('[aria-label="Ver más usuarios"]')?.click();
    fixture.detectChanges();
    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain('Lector 11');
  });
});
