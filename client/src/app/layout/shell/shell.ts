import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { APP_NAME } from '../../core/title-strategy';

interface NavItem {
  label: string;
  icon: string;
  link?: string;
  /** Shown but disabled until the feature ships. */
  soon?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly drawer = viewChild.required<MatSidenav>('drawer');

  protected readonly appName = APP_NAME;
  protected readonly user = this.auth.user;
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly initials = computed(() =>
    (this.user()?.name ?? '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  );

  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 959.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  protected readonly practiceNav: NavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', link: '/dashboard' },
    { label: 'Speaking practice', icon: 'record_voice_over', soon: true },
    { label: 'Written practice', icon: 'edit_note', soon: true },
    { label: 'Mock tests', icon: 'timer', soon: true },
    { label: 'Progress', icon: 'insights', soon: true },
  ];

  protected readonly accountNav: NavItem[] = [
    { label: 'Profile', icon: 'person', link: '/profile' },
  ];

  protected readonly adminNav: NavItem[] = [
    { label: 'Users', icon: 'group', link: '/admin/users' },
  ];

  protected closeOnHandset(): void {
    if (this.isHandset()) void this.drawer().close();
  }

  protected logout(): void {
    this.auth.logout().subscribe();
  }
}
