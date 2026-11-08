import { BreakpointObserver } from '@angular/cdk/layout';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import type { AppIcon } from '../../core/icons';
import { ThemeService } from '../../core/theme/theme.service';
import { APP_NAME } from '../../core/title-strategy';
import { UiAvatar } from '../../ui/avatar/avatar';
import { UiIcon } from '../../ui/icon/icon';

interface NavItem {
  label: string;
  short: string;
  icon: AppIcon;
  link?: string;
  /** Shown but locked until the feature ships. */
  soon?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
    UiAvatar,
    UiIcon,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);

  protected readonly appName = APP_NAME;
  protected readonly user = this.auth.user;
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly firstName = computed(() => this.user()?.name.split(/\s+/)[0] ?? '');

  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 959.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  protected readonly practiceNav: NavItem[] = [
    { label: 'Home', short: 'Home', icon: 'lucideHouse', link: '/dashboard' },
    { label: 'Practice', short: 'Practice', icon: 'lucideMic', link: '/practice' },
    { label: 'Voice test', short: 'Test', icon: 'lucideTimer', link: '/voice-test' },
    { label: 'Progress', short: 'Progress', icon: 'lucideChartLine', soon: true },
  ];

  protected readonly accountNav: NavItem[] = [
    { label: 'Mic check', short: 'Mic', icon: 'lucideHeadphones', link: '/mic-check' },
    { label: 'Profile', short: 'Profile', icon: 'lucideUser', link: '/profile' },
  ];

  protected readonly adminNav: NavItem[] = [
    { label: 'Questions', short: 'Questions', icon: 'lucideBookOpen', link: '/admin/questions' },
    { label: 'Users', short: 'Users', icon: 'lucideUsers', link: '/admin/users' },
  ];

  /** Phone bottom bar: Home, Practice, Test, Profile. */
  protected readonly tabs = computed<NavItem[]>(() => [
    this.practiceNav[0]!,
    this.practiceNav[1]!,
    this.practiceNav[2]!,
    this.accountNav[1]!,
  ]);

  protected logout(): void {
    this.auth.logout().subscribe();
  }
}
