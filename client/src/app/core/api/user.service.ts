import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import type { Page, ProfileUpdate, Role, User } from '../models/user';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  updateProfile(update: ProfileUpdate): Observable<User> {
    return this.http.patch<{ user: User }>('/api/users/me', update).pipe(
      map((res) => res.user),
      tap((user) => this.auth.setUser(user)),
    );
  }

  /** Admin only. */
  listUsers(query: {
    page: number;
    limit: number;
    q?: string;
    role?: Role | '';
  }): Observable<Page<User>> {
    let params = new HttpParams().set('page', query.page).set('limit', query.limit);
    if (query.q) params = params.set('q', query.q);
    if (query.role) params = params.set('role', query.role);
    return this.http.get<Page<User>>('/api/admin/users', { params });
  }
}
