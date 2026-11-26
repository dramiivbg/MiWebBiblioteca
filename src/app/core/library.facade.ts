import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { bibliotecaErrorMessage } from '../Biblioteca/biblioteca-error';
import { Book, LibraryUser, Reservation } from '../Biblioteca/biblioteca.models';
import { BookRepository } from './book.repository';
import { ReservationRepository } from './reservation.repository';
import { SessionStore } from './session.store';
import { UserRepository } from './user.repository';

type DashboardScope = 'user' | 'admin';

@Injectable({ providedIn: 'root' })
export class LibraryFacade {
  private readonly booksRepository = inject(BookRepository);
  private readonly reservationsRepository = inject(ReservationRepository);
  private readonly usersRepository = inject(UserRepository);
  private readonly session = inject(SessionStore);

  private readonly booksState = signal<Book[]>([]);
  private readonly reservationsState = signal<Reservation[]>([]);
  private readonly usersState = signal<LibraryUser[]>([]);
  private readonly overridesState = signal<Record<string, boolean>>({});
  private readonly loadedState = signal(false);
  private readonly searchState = signal('');
  private readonly requestedUserIds = new Set<string>();

  readonly books = this.booksState.asReadonly();
  readonly reservations = this.reservationsState.asReadonly();
  readonly users = this.usersState.asReadonly();
  readonly userEnabledOverrides = this.overridesState.asReadonly();
  readonly loaded = this.loadedState.asReadonly();
  readonly search = this.searchState.asReadonly();
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  readonly booksById = computed(
    () => new Map(this.booksState().map((book) => [book.id, book] as const)),
  );
  readonly usersById = computed(() => {
    const users = new Map<string, LibraryUser>();
    for (const user of this.usersState()) {
      if (!user.id) continue;
      users.set(user.id, user);
      users.set(user.id.toLowerCase(), user);
    }
    return users;
  });
  readonly activeReservations = computed(
    () => this.reservationsState().filter((item) => !item.isReturned).length,
  );
  readonly totalCopies = computed(() =>
    this.booksState().reduce((total, book) => total + book.stock, 0),
  );
  readonly visibleBooks = computed(() => {
    const query = this.searchState().trim().toLocaleLowerCase();
    return this.booksState().filter(
      (book) =>
        !query ||
        book.title.toLocaleLowerCase().includes(query) ||
        book.author.toLocaleLowerCase().includes(query),
    );
  });

  async load(scope: DashboardScope): Promise<void> {
    if (this.loadedState()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const [books, reservations, users] = await Promise.all([
        firstValueFrom(this.booksRepository.list()),
        firstValueFrom(
          this.reservationsRepository.list(scope === 'user' ? this.session.user()?.id : undefined),
        ),
        scope === 'admin' ? firstValueFrom(this.usersRepository.list()) : Promise.resolve([]),
      ]);
      this.booksState.set(books);
      this.reservationsState.set(reservations);
      this.usersState.set(users);
      this.loadedState.set(true);
      this.ensureUsersFor(reservations);
    } catch (error: unknown) {
      this.error.set(bibliotecaErrorMessage(error, 'No se pudo cargar la biblioteca.'));
    } finally {
      this.loading.set(false);
    }
  }

  setSearch(value: string): void {
    this.searchState.set(value);
  }

  clearFeedback(): void {
    this.message.set('');
    this.error.set('');
  }

  async reserve(book: Book): Promise<void> {
    if (book.stock < 1) return;

    const userId = this.session.user()?.id;
    if (!userId) return;

    const reservedAt = new Date();
    const dueDate = new Date(reservedAt);
    dueDate.setDate(dueDate.getDate() + 14);
    const temporaryId = -Date.now();
    const optimistic: Reservation = {
      id: temporaryId,
      userId,
      bookId: book.id,
      reservationDate: reservedAt.toISOString(),
      dueDate: dueDate.toISOString(),
      isReturned: false,
    };

    this.busy.set(true);
    this.clearFeedback();
    this.reservationsState.update((items) => [optimistic, ...items]);
    this.booksState.update((items) =>
      items.map((item) => (item.id === book.id ? { ...item, stock: item.stock - 1 } : item)),
    );

    try {
      const created = await firstValueFrom(
        this.reservationsRepository.create({
          userId,
          bookId: book.id,
          reservationDate: optimistic.reservationDate,
          dueDate: optimistic.dueDate,
        }),
      );
      this.reservationsState.update((items) =>
        items.map((item) => (item.id === temporaryId ? created : item)),
      );
      this.message.set(`Reservaste «${book.title}». Tienes 14 días para devolverlo.`);
    } catch (error: unknown) {
      this.rollbackReservation(temporaryId, book.id);
      this.error.set(bibliotecaErrorMessage(error, 'No se pudo reservar el libro.'));
    } finally {
      this.busy.set(false);
    }
  }

  async returnBook(reservation: Reservation): Promise<void> {
    this.busy.set(true);
    this.clearFeedback();
    this.reservationsState.update((items) =>
      items.map((item) =>
        item.id === reservation.id ? { ...item, isReturned: true } : item,
      ),
    );
    try {
      await firstValueFrom(this.reservationsRepository.markReturned(reservation.id));
      this.message.set('La devolución quedó confirmada.');
    } catch (error: unknown) {
      this.reservationsState.update((items) =>
        items.map((item) => (item.id === reservation.id ? reservation : item)),
      );
      this.error.set(bibliotecaErrorMessage(error, 'No se pudo confirmar la devolución.'));
    } finally {
      this.busy.set(false);
    }
  }

  async saveBook(book: Book | null, payload: Omit<Book, 'id'>): Promise<boolean> {
    this.busy.set(true);
    this.clearFeedback();
    const temporaryId = -Date.now();
    const optimistic: Book = book ? { ...payload, id: book.id } : { ...payload, id: temporaryId };

    if (book) {
      this.booksState.update((items) => items.map((item) => (item.id === book.id ? optimistic : item)));
    } else {
      this.booksState.update((items) => [optimistic, ...items]);
    }

    try {
      const saved = book
        ? await firstValueFrom(this.booksRepository.update(optimistic))
        : await firstValueFrom(this.booksRepository.create(payload));
      this.booksState.update((items) => items.map((item) => (item.id === optimistic.id ? saved : item)));
      this.message.set(book ? 'Libro actualizado.' : 'Libro añadido al catálogo.');
      return true;
    } catch (error: unknown) {
      this.restoreBook(book, optimistic.id);
      this.error.set(bibliotecaErrorMessage(error, 'No se pudo guardar el libro.'));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async deleteBook(book: Book): Promise<void> {
    this.busy.set(true);
    this.clearFeedback();
    const index = this.booksState().findIndex((item) => item.id === book.id);
    this.booksState.update((items) => items.filter((item) => item.id !== book.id));
    try {
      await firstValueFrom(this.booksRepository.remove(book.id));
      this.message.set('Libro eliminado.');
    } catch (error: unknown) {
      this.booksState.update((items) => {
        const restored = [...items];
        restored.splice(index < 0 ? 0 : index, 0, book);
        return restored;
      });
      this.error.set(bibliotecaErrorMessage(error, 'No se pudo eliminar el libro.'));
    } finally {
      this.busy.set(false);
    }
  }

  async toggleUser(user: LibraryUser): Promise<void> {
    if (!user.id) return;
    const userId = user.id;
    const enabled = this.isUserDisabled(user);
    this.busy.set(true);
    this.clearFeedback();
    this.overridesState.update((overrides) => ({ ...overrides, [userId]: enabled }));
    try {
      await firstValueFrom(this.usersRepository.setEnabled(userId, enabled));
      this.message.set(enabled ? 'Cuenta habilitada.' : 'Cuenta deshabilitada.');
    } catch (error: unknown) {
      this.overridesState.update((overrides) => {
        const reverted = { ...overrides };
        delete reverted[userId];
        return reverted;
      });
      this.error.set(bibliotecaErrorMessage(error, 'No se pudo actualizar la cuenta.'));
    } finally {
      this.busy.set(false);
    }
  }

  isUserDisabled(user: LibraryUser): boolean {
    const override = user.id ? this.overridesState()[user.id] : undefined;
    if (override !== undefined) return !override;
    return Boolean(user.lockoutEnd && Date.parse(user.lockoutEnd) > Date.now());
  }

  private ensureUsersFor(reservations: readonly Reservation[]): void {
    const knownUsers = this.usersById();
    for (const reservation of reservations) {
      const userId = reservation.userId;
      if (
        !userId ||
        knownUsers.has(userId) ||
        knownUsers.has(userId.toLowerCase()) ||
        this.requestedUserIds.has(userId)
      ) {
        continue;
      }

      this.requestedUserIds.add(userId);
      firstValueFrom(this.usersRepository.getById(userId))
        .then((user) => {
          if (!user) return;
          this.usersState.update((users) => [
            ...users.filter((item) => item.id !== user.id),
            user,
          ]);
        })
        .catch(() => undefined);
    }
  }

  private rollbackReservation(temporaryId: number, bookId: number): void {
    this.reservationsState.update((items) => items.filter((item) => item.id !== temporaryId));
    this.booksState.update((items) =>
      items.map((item) => (item.id === bookId ? { ...item, stock: item.stock + 1 } : item)),
    );
  }

  private restoreBook(book: Book | null, temporaryId: number): void {
    this.booksState.update((items) =>
      book
        ? items.map((item) => (item.id === temporaryId ? book : item))
        : items.filter((item) => item.id !== temporaryId),
    );
  }
}
