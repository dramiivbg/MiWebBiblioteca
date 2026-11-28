import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { bibliotecaErrorMessage } from '../Biblioteca/biblioteca-error';
import {
  Book,
  LibraryUser,
  Reservation,
  ReservationDetail,
  TopBook,
} from '../Biblioteca/biblioteca.models';
import { BookRepository } from './book.repository';
import { DashboardRepository } from './dashboard.repository';
import { ReservationRepository } from './reservation.repository';
import { SessionStore } from './session.store';
import { UserRepository } from './user.repository';

type DashboardScope = 'user' | 'admin';

@Injectable({ providedIn: 'root' })
export class LibraryFacade {
  private readonly booksRepository = inject(BookRepository);
  private readonly reservationsRepository = inject(ReservationRepository);
  private readonly usersRepository = inject(UserRepository);
  private readonly dashboardRepository = inject(DashboardRepository);
  private readonly session = inject(SessionStore);

  private readonly topBookStatsState = signal<TopBook[]>([]);
  private readonly booksState = signal<Book[]>([]);
  private readonly reservationsState = signal<Reservation[]>([]);
  private readonly usersState = signal<LibraryUser[]>([]);
  private readonly overridesState = signal<Record<string, boolean>>({});
  private readonly loadedState = signal(false);
  private readonly searchState = signal('');
  private readonly requestedUserIds = new Set<string>();

  readonly topBooks = computed(() => this.enrichTopBooks(this.topBookStatsState()));
  readonly topBooksLoading = signal(false);
  readonly topBooksError = signal('');
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

  async loadTopBooks(): Promise<void> {
    this.topBooksLoading.set(true);
    this.topBooksError.set('');
    try {
      const stats = await firstValueFrom(this.dashboardRepository.booksReservations());
      this.topBookStatsState.set(stats);
    } catch (error: unknown) {
      this.topBooksError.set(
        bibliotecaErrorMessage(error, 'No se pudo cargar el ranking de libros.'),
      );
    } finally {
      this.topBooksLoading.set(false);
    }
  }

  setSearch(value: string): void {
    this.searchState.set(value);
  }

  clearFeedback(): void {
    this.message.set('');
    this.error.set('');
  }

  async reserve(book: Book, requestedDueDate?: string): Promise<void> {
    if (book.stock < 1) return;

    const userId = this.session.user()?.id;
    if (!userId) return;

    const reservedAt = new Date();
    const dueDate = this.futureDueDate(requestedDueDate, reservedAt);
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
      const confirmedDueDate = this.futureDueDate(created.dueDate, reservedAt);
      this.reservationsState.update((items) =>
        items.map((item) =>
          item.id === temporaryId ? { ...created, dueDate: confirmedDueDate.toISOString() } : item,
        ),
      );
      this.message.set(
        `Reservaste «${book.title}». Devuélvelo el ${this.formatDueDate(confirmedDueDate)}.`,
      );
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
      items.map((item) => (item.id === reservation.id ? { ...item, isReturned: true } : item)),
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
      this.booksState.update((items) =>
        items.map((item) => (item.id === book.id ? optimistic : item)),
      );
    } else {
      this.booksState.update((items) => [optimistic, ...items]);
    }

    try {
      const saved = book
        ? await firstValueFrom(this.booksRepository.update(optimistic))
        : await firstValueFrom(this.booksRepository.create(payload));
      this.booksState.update((items) =>
        items.map((item) => (item.id === optimistic.id ? saved : item)),
      );
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

  private enrichTopBooks(stats: readonly TopBook[]): TopBook[] {
    const books = this.booksById();
    const users = this.usersById();
    const reservations = this.reservationsState();

    return stats
      .map((stat) => {
        const book = books.get(stat.bookId);
        const local = reservations.filter((reservation) => reservation.bookId === stat.bookId);
        const details = this.mergeReservationDetails(stat.reservations, local);

        return {
          bookId: stat.bookId,
          title: stat.title || book?.title || `Libro #${stat.bookId}`,
          author: stat.author || book?.author || 'Catálogo',
          totalReservations: Math.max(stat.totalReservations, details.length),
          reservations: details.map((detail) => this.enrichReservationDetail(detail, users)),
        };
      })
      .sort((left, right) => right.totalReservations - left.totalReservations)
      .slice(0, 5);
  }

  private mergeReservationDetails(
    fromApi: readonly ReservationDetail[],
    local: readonly Reservation[],
  ): ReservationDetail[] {
    const details = fromApi.map((detail) => {
      const match = local.find((reservation) => this.sameReservation(detail, reservation));
      if (!match) return detail;
      const current = this.reservationDetail(match);
      return {
        ...current,
        userName: detail.userName || current.userName,
        fullName: detail.fullName || current.fullName,
        email: detail.email || current.email,
      };
    });

    for (const reservation of local) {
      if (!details.some((detail) => this.sameReservation(detail, reservation))) {
        details.push(this.reservationDetail(reservation));
      }
    }

    return details;
  }

  private sameReservation(detail: ReservationDetail, reservation: Reservation): boolean {
    if (detail.id > 0 && reservation.id === detail.id) return true;
    if (!detail.userId || detail.userId !== reservation.userId) return false;

    return (
      (!detail.reservationDate ||
        this.sameDate(detail.reservationDate, reservation.reservationDate)) &&
      (!detail.dueDate || this.sameDate(detail.dueDate, reservation.dueDate))
    );
  }

  private sameDate(left: string, right: string): boolean {
    return left === right || Date.parse(left) === Date.parse(right);
  }

  private reservationDetail(reservation: Reservation): ReservationDetail {
    return {
      id: reservation.id,
      userId: reservation.userId,
      userName: '',
      fullName: '',
      email: '',
      reservationDate: reservation.reservationDate,
      dueDate: reservation.dueDate,
      isReturned: reservation.isReturned,
    };
  }

  private enrichReservationDetail(
    detail: ReservationDetail,
    users: ReadonlyMap<string, LibraryUser>,
  ): ReservationDetail {
    const user =
      users.get(detail.userId) ||
      users.get(detail.userId.toLocaleLowerCase()) ||
      this.findUserByName(detail, users);

    return {
      ...detail,
      userName: detail.userName || user?.userName || user?.fullName || '',
      fullName: detail.fullName || user?.fullName || '',
      email: detail.email || user?.email || '',
      reservationDate: detail.reservationDate,
      dueDate: detail.dueDate,
    };
  }

  private findUserByName(
    detail: ReservationDetail,
    users: ReadonlyMap<string, LibraryUser>,
  ): LibraryUser | undefined {
    const identity = [detail.userName, detail.fullName, detail.email]
      .filter(Boolean)
      .map((value) => value.toLocaleLowerCase());
    if (!identity.length) return undefined;
    return Array.from(users.values()).find((user) =>
      [user.userName, user.fullName, user.email].some((value) =>
        identity.includes(value.toLocaleLowerCase()),
      ),
    );
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
          this.usersState.update((users) => [...users.filter((item) => item.id !== user.id), user]);
        })
        .catch(() => undefined);
    }
  }

  private futureDueDate(requested: string | undefined, now: Date): Date {
    const parsed = requested ? new Date(requested) : null;
    if (parsed && !Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime()) {
      return parsed;
    }
    const fallback = new Date(now);
    fallback.setDate(fallback.getDate() + 14);
    return fallback;
  }

  private formatDueDate(date: Date): string {
    return new Intl.DateTimeFormat('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
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
