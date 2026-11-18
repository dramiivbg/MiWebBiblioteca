import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, defer, switchMap, throwError } from 'rxjs';
import { BibliotecaAuthService } from './biblioteca-api.service';

export const bibliotecaAuthInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(BibliotecaAuthService);
  if (/\/Auth\/(login|register|confirm-email|refresh|logout)(\?|$)/i.test(request.url)) {
    return next(request);
  }

  return defer(() => {
    let refreshAttempted = false;
    const initialRequest = auth.shouldRefresh()
      ? (refreshAttempted = true, auth.refresh().pipe(switchMap(() => next(withAccessToken(request, auth)))))
      : next(withAccessToken(request, auth));

    return initialRequest.pipe(
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
          return throwError(() => error);
        }
        if (refreshAttempted) {
          auth.clearSession();
          return throwError(() => error);
        }

        refreshAttempted = true;
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
