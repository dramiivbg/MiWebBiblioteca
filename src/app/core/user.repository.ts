import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { LibraryUser } from '../Biblioteca/biblioteca.models';
import { APP_CONFIG } from './app-config';

@Injectable({ providedIn: 'root' })
export class UserRepository {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  list(): Observable<LibraryUser[]> {
    return this.http.get<LibraryUser[]>(`${this.config.apiUrl}/User`);
  }

  getById(userId: string): Observable<LibraryUser> {
    return this.http.get<LibraryUser>(
      `${this.config.apiUrl}/user/${encodeURIComponent(userId)}`,
    );
  }

  setEnabled(userId: string, enabled: boolean): Observable<void> {
    const action = enabled ? 'enable' : 'disable';
    return this.http
      .get<void>(`${this.config.apiUrl}/user/${encodeURIComponent(userId)}/${action}`)
      .pipe(map(() => undefined));
  }
}
