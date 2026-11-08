import { DatePipe } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, map, of, startWith, switchMap } from 'rxjs';
import { apiErrorMessage } from '../../../core/api/api-error';
import { UserService } from '../../../core/api/user.service';
import type { Page, Role, User } from '../../../core/models/user';
import { UiAvatar } from '../../../ui/avatar/avatar';
import { UiIcon } from '../../../ui/icon/icon';

type LoadState =
  { status: 'loading' } | { status: 'ok'; page: Page<User> } | { status: 'error'; message: string };

@Component({
  selector: 'app-admin-users',
  imports: [DatePipe, UiAvatar, UiIcon],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.scss',
})
export class AdminUsersPage {
  private readonly users = inject(UserService);

  protected readonly roles: { value: Role | ''; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'student', label: 'Students' },
    { value: 'admin', label: 'Admins' },
  ];
  protected readonly pageSizes = [10, 20, 50, 100];

  protected readonly search = signal('');
  protected readonly role = signal<Role | ''>('');
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(20);

  private readonly query = computed(() => ({
    q: this.search().trim(),
    role: this.role(),
    page: this.pageIndex() + 1,
    limit: this.pageSize(),
  }));

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      debounceTime(250),
      switchMap((query) =>
        this.users.listUsers(query).pipe(
          map((page): LoadState => ({ status: 'ok', page })),
          catchError((err: unknown) =>
            of<LoadState>({ status: 'error', message: apiErrorMessage(err) }),
          ),
          startWith<LoadState>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as LoadState },
  );

  /** The loaded page; the previous one stays on screen while the next one loads. */
  protected readonly page = linkedSignal<LoadState, Page<User> | null>({
    source: this.state,
    computation: (s, previous) =>
      s.status === 'ok' ? s.page : s.status === 'error' ? null : (previous?.value ?? null),
  });

  protected readonly range = computed(() => {
    const p = this.page();
    if (!p || p.total === 0) return '0 of 0';
    const from = (p.page - 1) * p.limit + 1;
    return `${from}–${Math.min(p.page * p.limit, p.total)} of ${p.total}`;
  });
  protected readonly hasPrev = computed(() => this.pageIndex() > 0);
  protected readonly hasNext = computed(() => {
    const p = this.page();
    return !!p && p.page * p.limit < p.total;
  });

  protected onSearch(value: string): void {
    this.search.set(value);
    this.pageIndex.set(0);
  }

  protected onRole(value: Role | ''): void {
    this.role.set(value);
    this.pageIndex.set(0);
  }

  protected onPageSize(value: string): void {
    this.pageSize.set(Number(value));
    this.pageIndex.set(0);
  }

  protected step(delta: number): void {
    this.pageIndex.update((i) => Math.max(0, i + delta));
  }
}
