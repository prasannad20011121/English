import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { apiErrorMessage, apiFieldErrors } from '../../core/api/api-error';
import { UserService } from '../../core/api/user.service';
import { AuthService } from '../../core/auth/auth.service';
import {
  applyServerErrors,
  fromIsoDate,
  matchFields,
  passwordErrorMessage,
  passwordStrength,
  toIsoDate,
} from '../../core/forms/form-utils';
import { TTS_ACCENT_LABELS, type TtsAccent, type User } from '../../core/models/user';

@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfilePage {
  private readonly auth = inject(AuthService);
  private readonly users = inject(UserService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly user = this.auth.user;
  protected readonly accents = Object.entries(TTS_ACCENT_LABELS) as [TtsAccent, string][];
  protected readonly passwordErrorMessage = passwordErrorMessage;

  protected readonly savingProfile = signal(false);
  protected readonly profileError = signal<string | null>(null);
  protected readonly savingPassword = signal(false);
  protected readonly passwordError = signal<string | null>(null);
  protected readonly hidePassword = signal(true);

  protected readonly profileForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    college: ['', Validators.maxLength(120)],
    targetExamDate: this.fb.control<Date | null>(null),
    ttsAccent: this.fb.control<TtsAccent>('en-IN'),
  });

  protected readonly passwordForm = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, passwordStrength]],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchFields('newPassword', 'confirmPassword') },
  );

  constructor() {
    const user = this.user();
    if (user) this.resetProfileForm(user);
  }

  protected saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    const v = this.profileForm.getRawValue();
    this.savingProfile.set(true);
    this.profileError.set(null);
    this.users
      .updateProfile({
        name: v.name.trim(),
        college: v.college.trim() || null,
        targetExamDate: toIsoDate(v.targetExamDate),
        settings: { ttsAccent: v.ttsAccent },
      })
      .subscribe({
        next: (user) => {
          this.resetProfileForm(user);
          this.savingProfile.set(false);
          this.snackBar.open('Profile saved.', 'OK', { duration: 3000 });
        },
        error: (err: unknown) => {
          applyServerErrors(this.profileForm, apiFieldErrors(err));
          this.profileError.set(apiErrorMessage(err));
          this.savingProfile.set(false);
        },
      });
  }

  protected cancelProfile(): void {
    const user = this.user();
    if (user) this.resetProfileForm(user);
  }

  protected changePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.savingPassword.set(true);
    this.passwordError.set(null);
    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.passwordForm.reset();
        this.savingPassword.set(false);
        this.snackBar.open('Password changed. Other devices have been logged out.', 'OK', {
          duration: 5000,
        });
      },
      error: (err: unknown) => {
        const applied = applyServerErrors(this.passwordForm, apiFieldErrors(err));
        this.passwordError.set(applied ? null : apiErrorMessage(err));
        this.savingPassword.set(false);
      },
    });
  }

  private resetProfileForm(user: User): void {
    this.profileForm.reset({
      name: user.name,
      college: user.college ?? '',
      targetExamDate: fromIsoDate(user.targetExamDate),
      ttsAccent: user.settings.ttsAccent,
    });
  }
}
