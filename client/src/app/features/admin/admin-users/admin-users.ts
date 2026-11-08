import { DatePipe } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { catchError, debounceTime, map, of, startWith, switchMap } from 'rxjs';
import { apiErrorMessage } from '../../../core/api/api-error';
import { UserService } from '../../../core/api/user.service';
import type { Page, Role, User } from '../../../core/models/user';

type LoadState =
  { status: 'loading' } | { status: 'ok'; page: Page<User> } | { status: 'error'; message: string };

@Component({
  selector: 'app-admin-users',
  imports: [
    DatePipe,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.scss',
})
export class AdminUsersPage {
  private readonly users = inject(UserService);

  protected readonly columns = ['name', 'email', 'college', 'role', 'createdAt', 'lastLoginAt'];
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

  protected onSearch(value: string): void {
    this.search.set(value);
    this.pageIndex.set(0);
  }

  protected onRole(value: Role | ''): void {
    this.role.set(value);
    this.pageIndex.set(0);
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }
}
