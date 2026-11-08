import { FormControl, FormGroup } from '@angular/forms';
import {
  applyServerErrors,
  fromIsoDate,
  matchFields,
  passwordStrength,
  safeReturnUrl,
  toIsoDate,
} from './form-utils';

describe('form utils', () => {
  it('checks password strength like the API', () => {
    const check = (v: string) => passwordStrength(new FormControl(v));
    expect(check('')).toBeNull();
    expect(check('abc12')).toEqual({ passwordShort: true });
    expect(check('abcdefgh')).toEqual({ passwordWeak: true });
    expect(check('12345678')).toEqual({ passwordWeak: true });
    expect(check('secret123')).toBeNull();
  });

  it('flags mismatched confirmation fields', () => {
    const form = new FormGroup(
      { password: new FormControl('secret123'), confirm: new FormControl('secret124') },
      { validators: matchFields('password', 'confirm') },
    );
    expect(form.controls.confirm.hasError('mismatch')).toBe(true);
    form.controls.confirm.setValue('secret123');
    expect(form.controls.confirm.errors).toBeNull();
  });

  it('applies server field errors to matching controls', () => {
    const form = new FormGroup({ email: new FormControl('a@b.co') });
    expect(applyServerErrors(form, { email: 'Taken', unknown: 'x' })).toBe(true);
    expect(form.controls.email.getError('server')).toBe('Taken');
  });

  it('converts dates without time-zone shifts', () => {
    expect(toIsoDate(new Date(2027, 0, 5))).toBe('2027-01-05');
    expect(fromIsoDate('2027-01-05T00:00:00.000Z')?.getDate()).toBe(5);
    expect(toIsoDate(null)).toBeNull();
    expect(fromIsoDate(null)).toBeNull();
  });

  it('only allows in-app return URLs', () => {
    expect(safeReturnUrl('/profile')).toBe('/profile');
    expect(safeReturnUrl('//evil.com')).toBeNull();
    expect(safeReturnUrl('https://evil.com')).toBeNull();
    expect(safeReturnUrl(undefined)).toBeNull();
  });
});
