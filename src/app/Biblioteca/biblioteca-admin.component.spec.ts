import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { BibliotecaApiService } from './biblioteca-api.service';
import { BibliotecaAdminComponent } from './biblioteca-admin.component';
import { LibraryUser } from './biblioteca.models';

describe('BibliotecaAdminComponent', () => {
  const users: LibraryUser[] = [
    {
      id: 'disabled-user',
      address: '',
      userName: 'reader-one',
      email: 'reader-one@example.com',
      emailConfirmed: false,
      password: '',
      phoneNumber: '',
      role: 0,
      phoneNumberConfirmed: false,
      lockoutEnd: '9999-12-31T23:59:59.999Z',
      lockoutEnabled: true,
      accessFailedCount: 0,
      fullName: 'Reader One',
    },
    {
      id: 'active-user',
      address: '',
      userName: 'reader-two',
      email: 'reader-two@example.com',
      emailConfirmed: true,
      password: '',
      phoneNumber: '',
      role: 0,
      phoneNumberConfirmed: false,
      lockoutEnd: null,
      lockoutEnabled: true,
      accessFailedCount: 0,
      fullName: 'Reader Two',
    },
  ];

  it('updates account status and action labels while displaying email confirmation from emailConfirmed', async () => {
    const api = {
      books: vi.fn(() => of([])),
      reservations: vi.fn(() => of([])),
      users: vi.fn(() => of(users)),
      setUserEnabled: vi.fn(() => of<void>(undefined)),
    };

    await TestBed.configureTestingModule({
      imports: [BibliotecaAdminComponent],
      providers: [{ provide: BibliotecaApiService, useValue: api }],
    }).compileComponents();

    const fixture = TestBed.createComponent(BibliotecaAdminComponent);
    fixture.componentRef.setInput('user', {
      id: 'admin',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });
    fixture.componentInstance.setSection('users');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = () => Array.from(fixture.nativeElement.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
    expect(rows()[0].textContent).toContain('Deshabilitado');
    expect(rows()[0].textContent).toContain('Habilitar');
    expect(rows()[0].textContent).toContain('Pendiente');
    expect(rows()[1].textContent).toContain('Activo');
    expect(rows()[1].textContent).toContain('Deshabilitar');
    expect(rows()[1].textContent).toContain('Verificado');

    rows()[0].querySelector('button')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.setUserEnabled).toHaveBeenCalledWith('disabled-user', true);
    expect(rows()[0].textContent).toContain('Activo');
    expect(rows()[0].textContent).toContain('Deshabilitar');
    expect(rows()[0].textContent).toContain('Pendiente');

    rows()[1].querySelector('button')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.setUserEnabled).toHaveBeenCalledWith('active-user', false);
    expect(rows()[1].textContent).toContain('Deshabilitado');
    expect(rows()[1].textContent).toContain('Habilitar');
    expect(rows()[1].textContent).toContain('Verificado');
  });
});
