import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ReservationDetail, TopBook } from '../Biblioteca/biblioteca.models';
import { APP_CONFIG } from './app-config';

type JsonRecord = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class DashboardRepository {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  booksReservations(): Observable<TopBook[]> {
    return this.http
      .get<unknown>(`${this.config.apiUrl}/Dashboard/BooksReservations`)
      .pipe(map((response) => toTopBooks(response)));
  }
}

export function toTopBooks(response: unknown): TopBook[] {
  const rows = extractRows(response);
  const groups = new Map<string, { book: TopBook; grouped: boolean }>();

  for (const row of rows) {
    const embeddedBook = asRecord(row['book']) ?? asRecord(row['libro']);
    const title =
      text(row, ['title', 'bookTitle', 'bookName', 'name', 'titulo']) ||
      text(embeddedBook, ['title', 'name', 'titulo']);
    const author =
      text(row, ['author', 'bookAuthor', 'autor']) || text(embeddedBook, ['author', 'autor']);
    const rawId = row['bookId'] ?? row['idBook'] ?? row['libroId'] ?? embeddedBook?.['id'];
    const bookId = toNumber(rawId);
    const key = bookId > 0 ? String(bookId) : title.toLocaleLowerCase();
    if (!key) continue;

    const detailsValue = row['reservations'] ?? row['users'] ?? row['details'] ?? row['reservas'];
    const details = Array.isArray(detailsValue)
      ? detailsValue.map((item, index) => toReservationDetail(item, bookId, index))
      : hasReservationFields(row)
        ? [toReservationDetail(row, bookId, 0)]
        : [];
    const explicitCount = toNumber(
      row['totalReservations'] ??
        row['reservationCount'] ??
        row['reservationsCount'] ??
        row['count'] ??
        row['total'] ??
        row['quantity'],
    );
    const count = explicitCount > 0 ? explicitCount : Math.max(details.length, 1);
    const grouped = detailsValue !== undefined;

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        book: {
          bookId,
          title,
          author,
          totalReservations: count,
          reservations: details,
        },
        grouped,
      });
      continue;
    }

    if (!existing.book.title) existing.book.title = title;
    if (!existing.book.author) existing.book.author = author;
    existing.book.reservations.push(...details);
    existing.book.totalReservations = grouped
      ? Math.max(existing.book.totalReservations, count)
      : existing.book.totalReservations + count;
  }

  return Array.from(groups.values())
    .map(({ book }) => book)
    .sort((left, right) => right.totalReservations - left.totalReservations)
    .slice(0, 5);
}

function extractRows(response: unknown): JsonRecord[] {
  const record = asRecord(response);
  const candidates = Array.isArray(response)
    ? response
    : record
      ? [
          record['books'],
          record['data'],
          record['items'],
          record['result'],
          record['results'],
        ].find(Array.isArray)
      : undefined;
  if (!Array.isArray(candidates)) return [];
  return candidates
    .map((item) => (asRecord(item) ? item : typeof item === 'string' ? { title: item } : null))
    .filter((item): item is JsonRecord => item !== null);
}

function hasReservationFields(row: JsonRecord): boolean {
  return ['userId', 'idUser', 'userName', 'fullName', 'email', 'reservationDate', 'dueDate'].some(
    (key) => row[key] !== undefined,
  );
}

function toReservationDetail(value: unknown, bookId: number, index: number): ReservationDetail {
  const raw = asRecord(value) ?? (typeof value === 'string' ? { userName: value } : {});
  const user = asRecord(raw['user']) ?? {};
  const reservationId = toNumber(raw['id'] ?? raw['reservationId']);
  const userId = text(raw, ['userId', 'idUser', 'userEmail']) || text(user, ['id', 'userId']);

  return {
    id: reservationId > 0 ? reservationId : -((bookId + 1) * 1000 + index),
    userId,
    userName: text(raw, ['userName', 'username', 'name']) || text(user, ['userName', 'name']),
    fullName: text(raw, ['fullName', 'nombreCompleto']) || text(user, ['fullName']),
    email: text(raw, ['email', 'userEmail']) || text(user, ['email']),
    reservationDate:
      text(raw, ['reservationDate', 'reservedAt', 'createdAt', 'date', 'fecha']) ||
      text(user, ['reservationDate']),
    dueDate: text(raw, ['dueDate', 'returnDate', 'fechaDevolucion']) || text(user, ['dueDate']),
    isReturned: Boolean(raw['isReturned'] ?? raw['returned'] ?? user['isReturned']),
  };
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(record: JsonRecord | null, keys: readonly string[]): string {
  if (!record) return '';
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
