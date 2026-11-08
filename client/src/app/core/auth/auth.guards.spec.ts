import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  UrlTree,
  provideRouter,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { authGuard, guestGuard, roleGuard } from './auth.guards';
import { AuthService } from './auth.service';
import { authResponse, testUser } from '../testing/fixtures';

describe('route guards', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/profile' } as RouterStateSnapshot;
  const run = (guard: typeof authGuard) => TestBed.runInInjectionContext(() => guard(route, state));
  const urlOf = (result: unknown) => TestBed.inject(Router).serializeUrl(result as UrlTree);

  async function logIn(role: 'student' | 'admin') {
    const auth = TestBed.inject(AuthService);
    const done = firstValueFrom(auth.login('a@example.com', 'secret123'));
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/login')
      .flush(authResponse('t', { ...testUser, role }));
    await done;
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
      ],
    });
  });

  it('authGuard sends logged-out users to login with a return URL', () => {
    expect(urlOf(run(authGuard))).toBe('/login?returnUrl=%2Fprofile');
  });

  it('authGuard lets logged-in users through', async () => {
    await logIn('student');
    expect(run(authGuard)).toBe(true);
  });

  it('guestGuard sends logged-in users to the dashboard', async () => {
    expect(run(guestGuard)).toBe(true);
    await logIn('student');
    expect(urlOf(run(guestGuard))).toBe('/dashboard');
  });

  it('roleGuard only lets admins in', async () => {
    await logIn('student');
    expect(urlOf(run(roleGuard('admin')))).toBe('/dashboard');
  });

  it('roleGuard allows the right role', async () => {
    await logIn('admin');
    expect(run(roleGuard('admin'))).toBe(true);
  });
});
