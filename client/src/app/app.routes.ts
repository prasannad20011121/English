import type { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    // Login, sign-up and password pages share the split-screen auth layout.
    path: '',
    loadComponent: () =>
      import('./features/auth/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      {
        path: 'login',
        canActivate: [guestGuard],
        title: 'Log in',
        loadComponent: () => import('./features/auth/login/login').then((m) => m.LoginPage),
      },
      {
        path: 'register',
        canActivate: [guestGuard],
        title: 'Create account',
        loadComponent: () =>
          import('./features/auth/register/register').then((m) => m.RegisterPage),
      },
      {
        path: 'forgot-password',
        canActivate: [guestGuard],
        title: 'Forgot password',
        loadComponent: () =>
          import('./features/auth/forgot-password/forgot-password').then(
            (m) => m.ForgotPasswordPage,
          ),
      },
      {
        path: 'reset-password',
        title: 'Set a new password',
        loadComponent: () =>
          import('./features/auth/reset-password/reset-password').then((m) => m.ResetPasswordPage),
      },
    ],
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'practice',
        title: 'Speaking & listening practice',
        loadComponent: () => import('./features/voice/home/home').then((m) => m.VoiceHomePage),
      },
      {
        path: 'practice/session/:id',
        title: 'Practice',
        loadComponent: () =>
          import('./features/voice/player/player').then((m) => m.VoicePlayerPage),
      },
      {
        path: 'practice/session/:id/summary',
        title: 'Results',
        loadComponent: () =>
          import('./features/voice/summary/summary').then((m) => m.VoiceSummaryPage),
      },
      {
        path: 'voice-test',
        title: 'Voice test',
        loadComponent: () =>
          import('./features/voice/test/voice-test').then((m) => m.VoiceTestPage),
      },
      {
        path: 'mic-check',
        title: 'Microphone check',
        loadComponent: () =>
          import('./features/voice/mic-check/mic-check').then((m) => m.MicCheckPage),
      },
      {
        path: 'profile',
        title: 'Profile',
        loadComponent: () => import('./features/profile/profile').then((m) => m.ProfilePage),
      },
      {
        path: 'admin/questions',
        title: 'Question bank',
        canActivate: [roleGuard('admin')],
        loadComponent: () =>
          import('./features/admin/admin-questions/admin-questions').then(
            (m) => m.AdminQuestionsPage,
          ),
      },
      {
        path: 'admin/users',
        title: 'Users',
        canActivate: [roleGuard('admin')],
        loadComponent: () =>
          import('./features/admin/admin-users/admin-users').then((m) => m.AdminUsersPage),
      },
    ],
  },
  {
    path: '**',
    title: 'Page not found',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFoundPage),
  },
];
