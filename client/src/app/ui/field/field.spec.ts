import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { provideIcons } from '@ng-icons/core';
import { APP_ICONS } from '../../core/icons';
import { fieldError } from '../../core/forms/form-utils';
import { UiField, UiInput } from './field';

@Component({
  imports: [ReactiveFormsModule, UiField, UiInput],
  template: `
    <ui-field label="Email" hint="We never share it" [error]="fieldError(email)">
      <input uiInput [formControl]="email" />
    </ui-field>
  `,
})
class Host {
  readonly email = new FormControl('', Validators.required);
  readonly fieldError = fieldError;
}

describe('UiField', () => {
  async function render() {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideIcons(APP_ICONS)],
    }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    return { fixture, el, input: el.querySelector('input')!, label: el.querySelector('label')! };
  }

  it('connects the label and hint to the input', async () => {
    const { input, label, el } = await render();
    expect(input.classList).toContain('ui-input');
    expect(label.getAttribute('for')).toBe(input.id);
    const hint = el.querySelector('.field__hint')!;
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('shows the error after the field is touched and marks the input invalid', async () => {
    const { fixture, input, el } = await render();
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    const error = el.querySelector('.field__error')!;
    expect(error.textContent).toContain('This field is required');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
  });
});
