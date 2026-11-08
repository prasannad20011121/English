import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { authResponse, testUser } from '../testing/fixtures';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('stores the user and token after login', async () => {
    const result = firstValueFrom(auth.login('asha@example.com', 'secret123'));
    const req = http.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({ email: 'asha@example.com', password: 'secret123' });
    expect(req.request.withCredentials).toBe(true);
    req.flush(authResponse());

    expect(await result).toEqual(testUser);
    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.token).toBe('access-1');
    expect(localStorage.getItem('shl.hasSession')).toBe('1');
  });

  it('clears the session on logout even if the request fails', async () => {
    const login = firstValueFrom(auth.login('asha@example.com', 'secret123'));
    http.expectOne('/api/auth/login').flush(authResponse());
    await login;

    const done = firstValueFrom(auth.logout(), { defaultValue: undefined });
    http.expectOne('/api/auth/logout').flush(null, { status: 500, statusText: 'Server Error' });
    await done;

    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.token).toBeNull();
    expect(localStorage.getItem('shl.hasSession')).toBeNull();
  });

  it('shares one refresh request between concurrent callers', async () => {
    const a = firstValueFrom(auth.refresh());
    const b = firstValueFrom(auth.refresh());
    http.expectOne('/api/auth/refresh').flush(authResponse('access-2'));
    expect(await a).toBe('access-2');
    expect(await b).toBe('access-2');
  });

  it('skips the start-up refresh for first-time visitors', async () => {
    await auth.restoreSession();
    http.expectNone('/api/auth/refresh');
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('restores a session from the refresh cookie and survives a failed refresh', async () => {
    localStorage.setItem('shl.hasSession', '1');
    const restored = auth.restoreSession();
    http.expectOne('/api/auth/refresh').flush(authResponse('access-3'));
    await restored;
    expect(auth.user()?.email).toBe('asha@example.com');

    const second = auth.restoreSession();
    http
      .expectOne('/api/auth/refresh')
      .flush({ error: { code: 'SESSION_EXPIRED' } }, { status: 401, statusText: 'Unauthorized' });
    await second;
    expect(auth.isLoggedIn()).toBe(false);
  });
});
