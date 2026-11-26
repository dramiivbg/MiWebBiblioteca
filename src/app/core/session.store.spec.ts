import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { APP_CONFIG } from './app-config';
import { SessionStore } from './session.store';

const tokens = {
  accessToken: 'header.payload.signature',
  accessTokenExpiresAt: '2030-01-01T00:00:00.000Z',
};

const user = {
  id: 'user-1',
  email: 'reader@example.com',
  name: 'Lector',
  role: 'user' as const,
};

describe('SessionStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
  });

  afterEach(() => sessionStorage.clear());

  it('restores sealed sessions and exposes frozen values', async () => {
    const store = TestBed.inject(SessionStore);
    await store.saveTokens(tokens);
    await store.saveUser(user);
    await store.hydrate();

    expect(store.tokens()).toEqual(tokens);
    expect(store.user()).toEqual(user);
    expect(Object.isFrozen(store.tokens())).toBe(true);
    expect(Object.isFrozen(store.user())).toBe(true);
  });

  it('discards and clears the session when biblioteca.session is edited', async () => {
    const store = TestBed.inject(SessionStore);
    await store.saveTokens(tokens);
    await store.saveUser(user);

    const key = TestBed.inject(APP_CONFIG).sessionKeys.tokens;
    const envelope = JSON.parse(sessionStorage.getItem(key) ?? '{}') as {
      data: { accessToken: string };
    };
    envelope.data.accessToken = 'tampered-token';
    sessionStorage.setItem(key, JSON.stringify(envelope));

    await store.hydrate();

    expect(store.tokens()).toBeNull();
    expect(store.user()).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(sessionStorage.getItem('biblioteca.session.user')).toBeNull();
  });

  it('discards and clears the session when biblioteca.session.user is edited', async () => {
    const store = TestBed.inject(SessionStore);
    await store.saveTokens(tokens);
    await store.saveUser(user);

    const key = TestBed.inject(APP_CONFIG).sessionKeys.user;
    const envelope = JSON.parse(sessionStorage.getItem(key) ?? '{}') as {
      data: { role: string };
    };
    envelope.data.role = 'admin';
    sessionStorage.setItem(key, JSON.stringify(envelope));

    await store.hydrate();

    expect(store.tokens()).toBeNull();
    expect(store.user()).toBeNull();
    expect(sessionStorage.getItem('biblioteca.session')).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('rejects a plain JSON value written to a protected key', async () => {
    const store = TestBed.inject(SessionStore);
    sessionStorage.setItem('biblioteca.session', JSON.stringify(tokens));
    sessionStorage.setItem('biblioteca.session.user', JSON.stringify(user));

    await store.hydrate();

    expect(store.tokens()).toBeNull();
    expect(store.user()).toBeNull();
    expect(sessionStorage.getItem('biblioteca.session')).toBeNull();
    expect(sessionStorage.getItem('biblioteca.session.user')).toBeNull();
  });
});
