import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import type { Role } from '../models/user';
import { AuthService } from './auth.service';

/** Logged-in users only; others go to /login and come back afterwards. */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(AuthService).isLoggedIn()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Keeps logged-in users away from the login and register pages. */
export const guestGuard: CanActivateFn = () =>
  inject(AuthService).isLoggedIn() ? inject(Router).createUrlTree(['/dashboard']) : true;

/** Only users with one of the given roles; others are sent to the dashboard. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return (_route, state) => {
    const user = inject(AuthService).user();
    const router = inject(Router);
    if (!user) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    return roles.includes(user.role) ? true : router.createUrlTree(['/dashboard']);
  };
}
