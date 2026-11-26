import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { BibliotecaAuthService } from '../Biblioteca/biblioteca-api.service';
import { UserRole } from '../Biblioteca/biblioteca.models';

export const authGuard: CanActivateFn = () => {
  const auth = inject(BibliotecaAuthService);
  const router = inject(Router);
  return auth.signedInUser() ? true : router.createUrlTree(['/login']);
};

export const roleMatch = (role: UserRole): CanMatchFn => () => {
  const auth = inject(BibliotecaAuthService);
  return auth.signedInUser()?.role === role;
};

export const dashboardEntryGuard: CanActivateFn = () => {
  const auth = inject(BibliotecaAuthService);
  const router = inject(Router);
  const user = auth.signedInUser();
  if (!user) return router.createUrlTree(['/login']);
  return router.createUrlTree([user.role === 'admin' ? '/admin' : '/user']);
};
