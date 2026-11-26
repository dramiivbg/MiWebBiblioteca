import { Component, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthFacade } from './core/auth.facade';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  readonly auth = inject(AuthFacade);

  constructor() {
    effect(() => {
      if (!this.auth.user() && /^\/(user|admin)(\/|$)/.test(this.router.url)) {
        void this.router.navigateByUrl('/login');
      }
    });
  }
}
