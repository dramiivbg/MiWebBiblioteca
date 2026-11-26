import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { Book, LibraryUser, Reservation } from '../Biblioteca/biblioteca.models';

@Component({
  selector: 'app-reservation-table',
  imports: [DatePipe],
  template: `
    @if (reservations().length) {
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              @if (showUser()) { <th scope="col">LECTOR</th> }
              <th scope="col">LIBRO</th>
              <th scope="col">RESERVADO EL</th>
              <th scope="col">DEVOLUCIÓN</th>
              <th scope="col">ESTADO</th>
              @if (showActions()) { <th scope="col">ACCIÓN</th> }
            </tr>
          </thead>
          <tbody>
            @for (reservation of reservations(); track reservation.id) {
              @let reader = usersById().get(reservation.userId) || usersById().get(reservation.userId.toLowerCase());
              <tr>
                @if (showUser()) {
                  <td>
                    <strong>{{ reader?.userName || reader?.fullName || 'Usuario' }}</strong>
                    <small class="table-subtext">
                      {{ reader?.email || reader?.fullName || reader?.userName || 'Usuario' }}
                    </small>
                  </td>
                }
                <td>
                  <strong>{{ booksById().get(reservation.bookId)?.title || 'Libro #' + reservation.bookId }}</strong>
                  <small class="table-subtext">
                    {{ booksById().get(reservation.bookId)?.author || 'Catálogo' }}
                  </small>
                </td>
                <td>{{ reservation.reservationDate | date: 'd MMM y' }}</td>
                <td>{{ reservation.dueDate | date: 'd MMM y' }}</td>
                <td>
                  <span class="status-pill" [class.returned]="reservation.isReturned">
                    {{ reservation.isReturned ? 'Devuelto' : 'En préstamo' }}
                  </span>
                </td>
                @if (showActions()) {
                  <td>
                    @if (!reservation.isReturned) {
                      <button
                        class="table-action"
                        type="button"
                        [disabled]="busy()"
                        (click)="returnBook.emit(reservation)"
                      >
                        Confirmar devolución
                      </button>
                    } @else {
                      <span class="completed-label">Completado</span>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="empty-state">
        <span aria-hidden="true">◷</span>
        <h3>Aún no hay reservas.</h3>
        <p>Las reservas aparecerán aquí.</p>
      </div>
    }
  `,
})
export class ReservationTableComponent {
  readonly reservations = input.required<readonly Reservation[]>();
  readonly booksById = input.required<ReadonlyMap<number, Book>>();
  readonly usersById = input.required<ReadonlyMap<string, LibraryUser>>();
  readonly showUser = input(false);
  readonly showActions = input(false);
  readonly busy = input(false);
  readonly returnBook = output<Reservation>();
}
