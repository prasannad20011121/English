import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { authResponse } from '../testing/fixtures';

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;

  async function logIn(token = 'old-token') {
    const done = firstValueFrom(auth.login('asha@example.com', 'secret123'));
    backend.expectOne('/api/auth/login').flush(authResponse(token));
    await done;
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => backend.verify());

  it('adds the bearer token to API calls only', async () => {
    await logIn();
    void firstValueFrom(http.get('/api/users/me'));
    expect(backend.expectOne('/api/users/me').request.headers.get('Authorization')).toBe(
      'Bearer old-token',
    );
    void firstValueFrom(http.get('/assets/data.json'));
    expect(backend.expectOne('/assets/data.json').request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    await logIn();
    const result = firstValueFrom(http.get<{ ok: boolean }>('/api/users/me'));
    backend.expectOne('/api/users/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/auth/refresh').flush(authResponse('new-token'));
    const retry = backend.expectOne('/api/users/me');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-token');
    retry.flush({ ok: true });
    expect(await result).toEqual({ ok: true });
  });

  it('sends the user to log in when the refresh fails', async () => {
    await logIn();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const result = firstValueFrom(http.get('/api/users/me'));
    backend.expectOne('/api/users/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });

    await expect(result).rejects.toBeTruthy();
    expect(auth.isLoggedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(
      ['/login'],
      expect.objectContaining({ queryParams: expect.objectContaining({ expired: 1 }) }),
    );
  });

  it('does not retry failed logins', async () => {
    const result = firstValueFrom(auth.login('asha@example.com', 'wrong'));
    backend.expectOne('/api/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    await expect(result).rejects.toBeTruthy();
    backend.expectNone('/api/auth/refresh');
  });
});
