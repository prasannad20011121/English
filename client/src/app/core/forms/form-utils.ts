import type { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Puts server-side field messages onto the matching form controls as `{ server: message }`. */
export function applyServerErrors(form: FormGroup, fields: Record<string, string>): boolean {
  let applied = false;
  for (const [path, message] of Object.entries(fields)) {
    const control = form.get(path);
    if (control) {
      control.setErrors({ ...(control.errors ?? {}), server: message });
      control.markAsTouched();
      applied = true;
    }
  }
  return applied;
}

/** Same rule as the API: 8–72 characters with at least one letter and one number. */
export const passwordStrength: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = String(control.value ?? '');
  if (!value) return null;
  if (value.length < 8) return { passwordShort: true };
  if (value.length > 72) return { passwordLong: true };
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return { passwordWeak: true };
  return null;
};

/** Group validator: `confirm` must equal `password` (control names are configurable). */
export function matchFields(field: string, confirmField: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const a = group.get(field)?.value;
    const confirm = group.get(confirmField);
    if (!confirm) return null;
    const mismatch = !!confirm.value && a !== confirm.value;
    const rest = { ...(confirm.errors ?? {}) };
    delete rest['mismatch'];
    if (mismatch) confirm.setErrors({ ...rest, mismatch: true });
    else confirm.setErrors(Object.keys(rest).length ? rest : null);
    return null;
  };
}

const DEFAULT_MESSAGES: Record<string, string> = {
  required: 'This field is required',
  email: 'Enter a valid email address',
  minlength: 'This is too short',
  maxlength: 'This is too long',
  passwordShort: 'Use at least 8 characters',
  passwordLong: 'Use at most 72 characters',
  passwordWeak: 'Include at least one letter and one number',
  mismatch: 'Passwords do not match',
};

/**
 * The message to show under a field, or null. Shown once the field was touched (or the form
 * was submitted). Server-side errors win; `messages` overrides the defaults per error key.
 */
export function fieldError(
  control: AbstractControl | null | undefined,
  messages: Record<string, string> = {},
): string | null {
  if (!control?.errors || !control.touched) return null;
  const errors = control.errors;
  if (typeof errors['server'] === 'string') return errors['server'];
  for (const key of Object.keys(errors)) {
    const message = messages[key] ?? DEFAULT_MESSAGES[key];
    if (message) return message;
  }
  return 'Please check this field';
}

/** 0 = empty, 1 = weak, 2 = okay, 3 = strong. */
export function passwordScore(value: string): 0 | 1 | 2 | 3 {
  if (!value) return 0;
  const hasLetter = /[A-Za-z]/.test(value);
  const hasDigit = /\d/.test(value);
  if (value.length < 8 || !hasLetter || !hasDigit) return 1;
  const hasMixedCase = /[a-z]/.test(value) && /[A-Z]/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);
  return value.length >= 12 || hasMixedCase || hasSymbol ? 3 : 2;
}

/** `YYYY-MM-DD…` from the API → `YYYY-MM-DD` for a native date input ('' when empty). */
export function isoDay(value: string | null | undefined): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

/** Local calendar date → `YYYY-MM-DD` (no time-zone shift). */
export function toIsoDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** `YYYY-MM-DD…` from the API → a local Date for that calendar day. */
export function fromIsoDate(value: string | null | undefined): Date | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Only allow in-app paths as redirect targets (prevents open redirects). */
export function safeReturnUrl(url: string | null | undefined): string | null {
  return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\') ? url : null;
}
