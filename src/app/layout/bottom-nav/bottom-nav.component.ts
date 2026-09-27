import { Component, inject, output } from '@angular/core';
import { IsActiveMatchOptions, Router, RouterLink, RouterLinkActive } from '@angular/router';

/** Pantalla que aloja la hoja "Añadir movimiento". */
const HOME_PATH = '/desktop';

/** Misma ruta que abre "Inversiones" desde el pie del sidebar de escritorio. */
const INVERSIONES_PATH = '/desktop/inversiones/oro';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.scss'
})
export class BottomNavComponent {
  private readonly router = inject(Router);

  /**
   * Pulsación del «+» central cuando ya estamos en /desktop: la pantalla
   * anfitriona abre su hoja de añadir movimiento dentro del mismo gesto
   * (así iOS muestra el teclado). Desde cualquier otra pantalla no se emite:
   * se navega a /desktop?add=1 y es el dashboard quien abre la hoja.
   */
  readonly add = output<void>();

  readonly inversionesRoute = INVERSIONES_PATH;

  /** /desktop lleva ?year&month; solo importa el path para marcar "Resumen". */
  readonly resumenActiveOptions: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    fragment: 'ignored',
    matrixParams: 'ignored'
  };

  onAdd(): void {
    const path = this.router.url.split(/[?#]/)[0];
    if (path === HOME_PATH) {
      this.add.emit();
      return;
    }
    this.router.navigate([HOME_PATH], { queryParams: { add: 1 } });
  }
}
