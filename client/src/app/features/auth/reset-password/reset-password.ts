import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage, apiFieldErrors } from '../../../core/api/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import {
  applyServerErrors,
  fieldError,
  matchFields,
  passwordStrength,
} from '../../../core/forms/form-utils';
import { UiField, UiInput, UiSuffix } from '../../../ui/field/field';
import { UiIcon } from '../../../ui/icon/icon';
import { UiPasswordMeter } from '../../../ui/password-meter/password-meter';
import { ToastService } from '../../../ui/toast/toast.service';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, UiField, UiInput, UiSuffix, UiIcon, UiPasswordMeter],
  templateUrl: './reset-password.html',
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** `?token=` from the emailed link, bound by the router. */
  readonly token = input<string>();

  protected readonly fieldError = fieldError;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hidePassword = signal(true);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      password: ['', [Validators.required, passwordStrength]],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchFields('password', 'confirmPassword') },
  );

  protected submit(): void {
    const token = this.token();
    if (!token || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.auth.resetPassword(token, this.form.getRawValue().password).subscribe({
      next: () => {
        this.toast.show('Your password has been updated.');
        void this.router.navigateByUrl('/dashboard');
      },
      error: (err: unknown) => {
        applyServerErrors(this.form, apiFieldErrors(err));
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
