import { InjectionToken } from '@angular/core';

export interface AppConfig {
  readonly apiUrl: string;
  readonly sessionSecret: string;
  readonly sessionKeys: {
    readonly tokens: string;
    readonly user: string;
  };
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    apiUrl: 'http://localhost:5000/api',
    sessionSecret:
      'biblioteca-session-integrity-v1-9f4c2a7e6d18b30f5c8a1e74d9206b3f',
    sessionKeys: {
      tokens: 'biblioteca.session',
      user: 'biblioteca.session.user',
    },
  }),
});
