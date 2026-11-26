import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, defer, switchMap, throwError } from 'rxjs';
import { BibliotecaAuthService } from './biblioteca-api.service';
import { SKIP_AUTH } from '../core/auth-context';

export const bibliotecaAuthInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(BibliotecaAuthService);
  if (request.context.get(SKIP_AUTH)) return next(request);

  return defer(() => {
    const proactiveRefresh = auth.shouldRefresh();
    const initial = proactiveRefresh
      ? auth.refresh().pipe(switchMap(() => next(withAccessToken(request, auth))))
      : next(withAccessToken(request, auth));

    return initial.pipe(
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
          return throwError(() => error);
        }
        if (proactiveRefresh) {
          auth.clearSession();
          return throwError(() => error);
        }

        return auth.refresh().pipe(
          switchMap(() => next(withAccessToken(request, auth))),
          catchError((refreshError: unknown) => {
            auth.clearSession();
            return throwError(() => refreshError);
          }),
        );
      }),
    );
  });
};

function withAccessToken(
  request: Parameters<HttpInterceptorFn>[0],
  auth: BibliotecaAuthService,
) {
  const token = auth.accessToken();
  return token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;
}
