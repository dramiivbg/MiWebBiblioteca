import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Reservation } from '../Biblioteca/biblioteca.models';
import { APP_CONFIG } from './app-config';

@Injectable({ providedIn: 'root' })
export class ReservationRepository {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  list(userId?: string): Observable<Reservation[]> {
    let params = new HttpParams();
    if (userId) params = params.set('userId', userId);
    return this.http.get<Reservation[]>(`${this.config.apiUrl}/reservation`, { params });
  }

  create(reservation: Omit<Reservation, 'id' | 'isReturned'>): Observable<Reservation> {
    return this.http.post<Reservation>(`${this.config.apiUrl}/reservation`, {
      ...reservation,
      isReturned: false,
    });
  }

  markReturned(reservationId: number): Observable<Reservation> {
    return this.http.put<Reservation>(
      `${this.config.apiUrl}/reservation/${reservationId}/return`,
      null,
    );
  }
}
