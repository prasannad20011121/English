import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage, apiFieldErrors } from '../../../core/api/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import { CelebrateService } from '../../../core/celebrate.service';
import {
  applyServerErrors,
  fieldError,
  matchFields,
  passwordStrength,
  toIsoDate,
} from '../../../core/forms/form-utils';
import { UiField, UiInput, UiSuffix } from '../../../ui/field/field';
import { UiIcon } from '../../../ui/icon/icon';
import { UiPasswordMeter } from '../../../ui/password-meter/password-meter';
import { ToastService } from '../../../ui/toast/toast.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, UiField, UiInput, UiSuffix, UiIcon, UiPasswordMeter],
  templateUrl: './register.html',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly celebrate = inject(CelebrateService);

  protected readonly fieldError = fieldError;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hidePassword = signal(true);
  protected readonly today = toIsoDate(new Date());

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      email: ['', [Validators.required, Validators.email]],
      college: ['', Validators.maxLength(120)],
      /** YYYY-MM-DD from the native date input, or ''. */
      targetExamDate: [''],
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
        targetExamDate: v.targetExamDate || null,
        consentAudio: true,
      })
      .subscribe({
        next: (user) => {
          this.celebrate.burst();
          this.toast.show(`Welcome aboard, ${user.name.split(/\s+/)[0]}! Your account is ready.`);
          void this.router.navigateByUrl('/dashboard');
        },
        error: (err: unknown) => {
          const applied = applyServerErrors(this.form, apiFieldErrors(err));
          this.error.set(applied ? 'Please fix the highlighted fields.' : apiErrorMessage(err));
          this.loading.set(false);
        },
      });
  }
}
