import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { UiIllustration } from '../../ui/illustration/illustration';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, UiIllustration],
  template: `
    <main class="nf">
      <div class="tile tile--sky nf__card rise">
        <ui-illustration class="nf__art" name="lost" />
        <p class="eyebrow">Error 404</p>
        <h1 class="display">This page wandered off.</h1>
        <p class="nf__text">The link may be old, or the page has moved.</p>
        <a class="btn btn--primary" [routerLink]="loggedIn() ? '/dashboard' : '/login'">
          {{ loggedIn() ? 'Back to home' : 'Go to log in' }}
        </a>
      </div>
    </main>
  `,
  styles: `
    .nf {
      display: grid;
      place-items: center;
      min-height: 100dvh;
      padding: 24px 16px;
    }

    .nf__card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      max-width: 520px;
      padding: 36px 28px;
      text-align: center;
    }

    .nf__art {
      width: min(260px, 70%);
      margin-bottom: 8px;
    }

    .nf__text {
      margin-bottom: 14px;
    }
  `,
})
export class NotFoundPage {
  protected readonly loggedIn = inject(AuthService).isLoggedIn;
}
