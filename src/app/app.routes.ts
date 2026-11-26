import { Routes } from '@angular/router';
import { authGuard, dashboardEntryGuard, roleMatch } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [dashboardEntryGuard], children: [] },
  {
    path: 'login',
    title: 'Acceso | Biblioteca',
    loadComponent: () =>
      import('./Biblioteca/biblioteca-auth.component').then((m) => m.BibliotecaAuthComponent),
  },
  {
    path: 'user',
    title: 'Mi biblioteca',
    canActivate: [authGuard],
    canMatch: [roleMatch('user')],
    loadComponent: () =>
      import('./Biblioteca/biblioteca.component').then((m) => m.BibliotecaComponent),
  },
  {
    path: 'admin',
    title: 'Administración | Biblioteca',
    canActivate: [authGuard],
    canMatch: [roleMatch('admin')],
    loadComponent: () =>
      import('./Biblioteca/biblioteca-admin.component').then((m) => m.BibliotecaAdminComponent),
  },
  { path: '**', redirectTo: '' },
];
