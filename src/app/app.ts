import { Component } from '@angular/core';
import { BibliotecaComponent } from './Biblioteca/biblioteca.component';

@Component({
  imports: [BibliotecaComponent],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
}
