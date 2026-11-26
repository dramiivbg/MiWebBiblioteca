import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { bibliotecaAuthInterceptor } from './Biblioteca/biblioteca-auth.interceptor';
import { SessionStore } from './core/session.store';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([bibliotecaAuthInterceptor])),
    provideAppInitializer(() => inject(SessionStore).hydrate()),
  ],
};
