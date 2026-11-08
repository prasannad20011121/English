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

export function passwordErrorMessage(control: AbstractControl): string | null {
  const e = control.errors;
  if (!e) return null;
  if (e['required']) return 'Password is required';
  if (e['passwordShort']) return 'Use at least 8 characters';
  if (e['passwordLong']) return 'Use at most 72 characters';
  if (e['passwordWeak']) return 'Include at least one letter and one number';
  if (e['server']) return e['server'] as string;
  return null;
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
