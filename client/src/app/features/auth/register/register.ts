import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage, apiFieldErrors } from '../../../core/api/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import {
  applyServerErrors,
  matchFields,
  passwordErrorMessage,
  passwordStrength,
  toIsoDate,
} from '../../../core/forms/form-utils';
import { APP_NAME } from '../../../core/title-strategy';

@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatProgressBarModule,
  ],
  templateUrl: './register.html',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly appName = APP_NAME;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hidePassword = signal(true);
  protected readonly today = new Date();
  protected readonly passwordErrorMessage = passwordErrorMessage;

  protected readonly form = this.fb.group(
    {
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      email: ['', [Validators.required, Validators.email]],
      college: ['', Validators.maxLength(120)],
      targetExamDate: this.fb.control<Date | null>(null),
      password: ['', [Validators.required, passwordStrength]],
      confirmPassword: ['', Validators.required],
      consentAudio: [false, Validators.requiredTrue],
    },
    { validators: matchFields('password', 'confirmPassword') },
  );

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.loading.set(true);
    this.error.set(null);
    this.auth
      .register({
        name: v.name.trim(),
        email: v.email.trim(),
        password: v.password,
        college: v.college.trim() || undefined,
        targetExamDate: toIsoDate(v.targetExamDate),
        consentAudio: true,
      })
      .subscribe({
        next: () => void this.router.navigateByUrl('/dashboard'),
        error: (err: unknown) => {
          const applied = applyServerErrors(this.form, apiFieldErrors(err));
          this.error.set(applied ? 'Please fix the highlighted fields.' : apiErrorMessage(err));
          this.loading.set(false);
        },
      });
  }
}
