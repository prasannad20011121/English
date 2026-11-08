import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../../core/api/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import { fieldError } from '../../../core/forms/form-utils';
import { UiField, UiInput } from '../../../ui/field/field';
import { UiIcon } from '../../../ui/icon/icon';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, UiField, UiInput, UiIcon],
  templateUrl: './forgot-password.html',
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);

  protected readonly fieldError = fieldError;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sentMessage = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.auth.forgotPassword(this.form.getRawValue().email.trim()).subscribe({
      next: (message) => {
        this.sentMessage.set(message);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
