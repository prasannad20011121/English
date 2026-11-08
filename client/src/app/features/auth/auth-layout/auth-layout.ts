import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ThemeService } from '../../../core/theme/theme.service';
import { APP_NAME } from '../../../core/title-strategy';
import { UiIcon } from '../../../ui/icon/icon';
import { UiIllustration } from '../../../ui/illustration/illustration';

/** Split screen for login / sign-up / password pages: pastel showcase + form card. */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, RouterLink, UiIcon, UiIllustration],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {
  protected readonly appName = APP_NAME;
  protected readonly theme = inject(ThemeService);
}
