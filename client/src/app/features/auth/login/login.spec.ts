import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { APP_ICONS } from '../../../core/icons';
import { authResponse } from '../../../core/testing/fixtures';
import { LoginPage } from './login';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let backend: HttpTestingController;
  let el: HTMLElement;

  const type = (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const submit = async () => {
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
        provideIcons(APP_ICONS),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LoginPage);
    backend = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => backend.verify());

  it('shows validation errors and sends nothing when empty', async () => {
    await submit();
    expect(el.textContent).toContain('Email is required');
    expect(el.textContent).toContain('Password is required');
    backend.expectNone('/api/auth/login');
  });

  it('shows the API error message on failed login', async () => {
    type('input[type=email]', 'asha@example.com');
    type('input[formcontrolname=password]', 'wrong1234');
    await submit();
    backend
      .expectOne('/api/auth/login')
      .flush(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Invalid email or password.');
  });

  it('goes to the safe return URL after logging in', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.componentRef.setInput('returnUrl', '//evil.example.com');
    type('input[type=email]', 'asha@example.com');
    type('input[formcontrolname=password]', 'secret123');
    await submit();
    backend.expectOne('/api/auth/login').flush(authResponse());
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });
});
