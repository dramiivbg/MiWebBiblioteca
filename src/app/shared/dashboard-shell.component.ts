import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface DashboardNavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

@Component({
  selector: 'app-dashboard-shell',
  imports: [RouterLink],
  template: `
    <div class="app-frame">
      <div class="dashboard">
        <aside class="sidebar">
          <a class="brand sidebar-brand" routerLink="/" aria-label="Biblioteca, inicio">
            <span class="brand-mark" aria-hidden="true">B</span><span>Biblioteca</span>
          </a>
          <div class="sidebar-label">MENÚ</div>
          <nav class="side-nav" [attr.aria-label]="roleLabel() === 'ADMINISTRADOR' ? 'Navegación de administración' : 'Navegación principal'">
            @for (item of sections(); track item.id) {
              <button
                type="button"
                [class.active]="active() === item.id"
                [attr.aria-current]="active() === item.id ? 'page' : null"
                (click)="navigate.emit(item.id)"
              >
                <span aria-hidden="true">{{ item.icon }}</span> {{ item.label }}
              </button>
            }
          </nav>
          <div class="sidebar-bottom">
            <div class="sidebar-help">
              <span class="help-icon" aria-hidden="true">✦</span>
              <strong>¿Un libro te cambió?</strong>
              <span>Compártelo con la comunidad.</span>
            </div>
            <button class="logout-button" type="button" [disabled]="signingOut()" (click)="signOut.emit()">
              <span aria-hidden="true">↪</span> Cerrar sesión
            </button>
          </div>
        </aside>

        <main class="workspace">
          <header class="topbar">
            <div class="breadcrumb">
              <span>Biblioteca</span><span aria-hidden="true">/</span><strong>{{ title() }}</strong>
            </div>
            <div class="profile">
              <span class="profile-role">{{ roleLabel() }}</span>
              <span class="avatar" aria-hidden="true">{{ name().slice(0, 1).toUpperCase() }}</span>
              <span class="profile-name">{{ name() }}</span>
            </div>
          </header>

          <div class="page-content">
            @if (message()) {
              <div class="feedback success page-feedback" role="status">{{ message() }}</div>
            }
            @if (error()) {
              <div class="feedback danger page-feedback" role="alert">{{ error() }}</div>
            }
            <ng-content />
          </div>
        </main>
      </div>
    </div>
  `,
})
export class DashboardShellComponent {
  readonly name = input.required<string>();
  readonly roleLabel = input.required<string>();
  readonly title = input.required<string>();
  readonly sections = input.required<readonly DashboardNavItem[]>();
  readonly active = input.required<string>();
  readonly signingOut = input(false);
  readonly message = input('');
  readonly error = input('');
  readonly navigate = output<string>();
  readonly signOut = output<void>();
}
