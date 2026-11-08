import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { APP_ICONS } from './core/icons';
import { ThemeService } from './core/theme/theme.service';
import { AppTitleStrategy } from './core/title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideIcons(APP_ICONS),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    provideAppInitializer(() => {
      inject(ThemeService); // applies the saved light/dark choice
      // Restore the session before the first route guard runs.
      return inject(AuthService).restoreSession();
    }),
  ],
};
