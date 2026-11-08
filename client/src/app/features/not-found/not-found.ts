import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="auth-page">
      <section class="auth-card" aria-labelledby="nf-title">
        <mat-icon class="nf-icon" aria-hidden="true">travel_explore</mat-icon>
        <h1 id="nf-title">Page not found</h1>
        <p class="subtitle">The page you were looking for doesn't exist or has moved.</p>
        <a mat-flat-button class="auth-submit" [routerLink]="loggedIn() ? '/dashboard' : '/login'">
          {{ loggedIn() ? 'Go to dashboard' : 'Go to log in' }}
        </a>
      </section>
    </div>
  `,
  styles: `
    .nf-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--mat-sys-primary);
    }
  `,
})
export class NotFoundPage {
  protected readonly loggedIn = inject(AuthService).isLoggedIn;
}
