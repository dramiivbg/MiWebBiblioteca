import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { BibliotecaAuthService } from './biblioteca-api.service';

describe('BibliotecaAuthService', () => {
  let auth: BibliotecaAuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(BibliotecaAuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('sends cookies when logging in and refreshing the access token', async () => {
    const login = auth.login('reader@example.com', 'password');

    const loginRequest = http.expectOne('http://localhost:5000/api/auth/login');
    expect(loginRequest.request.method).toBe('POST');
    expect(loginRequest.request.withCredentials).toBe(true);
    loginRequest.flush({
      accessToken: 'login-access-token',
      expiresAt: '2026-11-18T18:00:00Z',
    });

    const loginTokens = await login;
    expect(loginTokens).toEqual({
      accessToken: 'login-access-token',
      accessTokenExpiresAt: '2026-11-18T18:00:00Z',
    });

    const refresh = firstValueFrom(auth.refresh());
    const refreshRequest = http.expectOne('http://localhost:5000/api/auth/refresh');
    expect(refreshRequest.request.method).toBe('POST');
    expect(refreshRequest.request.withCredentials).toBe(true);
    expect(refreshRequest.request.headers.has('Authorization')).toBe(false);
    refreshRequest.flush({
      accessToken: 'refreshed-access-token',
      expiresAt: '2026-11-18T19:00:00Z',
    });

    const refreshedTokens = await refresh;
    expect(refreshedTokens.accessToken).toBe('refreshed-access-token');
    expect(refreshedTokens.accessTokenExpiresAt).toBe('2026-11-18T19:00:00Z');
    expect(auth.session()).toEqual(refreshedTokens);
  });

  it('sends the forgot-password email as a JSON string and includes credentials', async () => {
    const response = firstValueFrom(auth.forgotPassword('reader@example.com'));
    const request = http.expectOne('http://localhost:5000/api/auth/forgot-password');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBe('"reader@example.com"');
    expect(request.request.headers.get('Content-Type')).toBe('application/json');
    expect(request.request.withCredentials).toBe(true);

    request.flush({ message: 'Si el correo existe, recibirás un enlace.' });
    await expect(response).resolves.toEqual({
      message: 'Si el correo existe, recibirás un enlace.',
    });
  });

  it('sends the refresh cookie on logout and clears the local session', async () => {
    const login = auth.login('reader@example.com', 'password');
    http.expectOne('http://localhost:5000/api/auth/login').flush({
      accessToken: 'login-access-token',
      expiresAt: '2026-11-18T18:00:00Z',
    });
    await login;

    const logout = firstValueFrom(auth.logout());
    const logoutRequest = http.expectOne('http://localhost:5000/api/auth/logout');
    expect(logoutRequest.request.withCredentials).toBe(true);
    expect(logoutRequest.request.headers.has('Authorization')).toBe(false);
    logoutRequest.flush(null);

    await logout;
    expect(auth.session()).toBeNull();
  });
});
