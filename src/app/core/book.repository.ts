import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Book } from '../Biblioteca/biblioteca.models';
import { APP_CONFIG } from './app-config';

@Injectable({ providedIn: 'root' })
export class BookRepository {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  list(filters: { title?: string; author?: string } = {}): Observable<Book[]> {
    let params = new HttpParams();
    if (filters.title) params = params.set('title', filters.title);
    if (filters.author) params = params.set('author', filters.author);
    return this.http.get<Book[]>(`${this.config.apiUrl}/Book`, { params });
  }

  create(book: Omit<Book, 'id'>): Observable<Book> {
    return this.http.post<Book>(`${this.config.apiUrl}/book`, { id: 0, ...book });
  }

  update(book: Book): Observable<Book> {
    return this.http.put<Book>(`${this.config.apiUrl}/book/${book.id}`, book);
  }

  remove(bookId: number): Observable<void> {
    return this.http.delete<void>(`${this.config.apiUrl}/book/${bookId}`);
  }
}
