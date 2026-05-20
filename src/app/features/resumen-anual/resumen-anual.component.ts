import { Component, signal, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Router } from '@angular/router';
import { BottomNavComponent } from '../../layout/bottom-nav/bottom-nav.component';

export type EstadoMes = 'cerrado' | 'en-curso' | 'pendiente';

export interface ResumenMes {
  nombre: string;
  estado: EstadoMes;
  ahorro: number;
  presupuestado: number;
  gastado: number;
}

export interface BarraMes {
  nombre: string;
  inicial: string;
  ahorro: number;
  estado: EstadoMes;
  alturaPixeles: number;
  color: string;
  indice: number;
}

const INICIALES_MESES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const ALTURA_MAXIMA_BARRA = 72;
const COLOR_VERDE = '#22c55e';
const COLOR_ROJO = '#ef4444';
const COLOR_GRIS = '#e2e8f0';
const COLOR_AZUL = '#3b82f6';

@Component({
  selector: 'app-resumen-anual',
  standalone: true,
  imports: [CurrencyPipe, BottomNavComponent],
  templateUrl: './resumen-anual.component.html',
  styleUrl: './resumen-anual.component.scss'
})
export class ResumenAnualComponent {
  private readonly router = inject(Router);

  readonly mesActual = new Date().getMonth();

  readonly anio = signal<number>(new Date().getFullYear());

  readonly meses = computed<ResumenMes[]>(() => [
    { nombre: 'Enero',      estado: 'cerrado',   ahorro: 180,  presupuestado: 2450, gastado: 2270 },
    { nombre: 'Febrero',    estado: 'cerrado',   ahorro: 220,  presupuestado: 2450, gastado: 2230 },
    { nombre: 'Marzo',      estado: 'cerrado',   ahorro: 95,   presupuestado: 2450, gastado: 2355 },
    { nombre: 'Abril',      estado: 'cerrado',   ahorro: 310,  presupuestado: 2450, gastado: 2140 },
    { nombre: 'Mayo',       estado: 'cerrado',   ahorro: 150,  presupuestado: 2450, gastado: 2300 },
    { nombre: 'Junio',      estado: 'en-curso',  ahorro: 200,  presupuestado: 2450, gastado: 2250 },
    { nombre: 'Julio',      estado: 'pendiente', ahorro: 0,    presupuestado: 0,    gastado: 0    },
    { nombre: 'Agosto',     estado: 'pendiente', ahorro: 0,    presupuestado: 0,    gastado: 0    },
    { nombre: 'Septiembre', estado: 'pendiente', ahorro: 0,    presupuestado: 0,    gastado: 0    },
    { nombre: 'Octubre',    estado: 'pendiente', ahorro: 0,    presupuestado: 0,    gastado: 0    },
    { nombre: 'Noviembre',  estado: 'pendiente', ahorro: 0,    presupuestado: 0,    gastado: 0    },
    { nombre: 'Diciembre',  estado: 'pendiente', ahorro: 0,    presupuestado: 0,    gastado: 0    },
  ]);

  readonly ahorroTotal = computed(() =>
    this.meses().reduce((suma, mes) => suma + mes.ahorro, 0)
  );

  readonly ingresosTotal = computed(() =>
    this.meses()
      .filter(mes => mes.estado !== 'pendiente')
      .reduce((suma, mes) => suma + mes.gastado + mes.ahorro, 0)
  );

  readonly gastosTotal = computed(() =>
    this.meses()
      .filter(mes => mes.estado !== 'pendiente')
      .reduce((suma, mes) => suma + mes.gastado, 0)
  );

  readonly barras = computed<BarraMes[]>(() => {
    const listaMeses = this.meses();
    const ahorrosAbsolutos = listaMeses.map(mes => Math.abs(mes.ahorro));
    const valorMaximo = Math.max(...ahorrosAbsolutos, 1);

    return listaMeses.map((mes, indice) => {
      const alturaPixeles = mes.estado === 'pendiente'
        ? 8
        : Math.max(Math.round((Math.abs(mes.ahorro) / valorMaximo) * ALTURA_MAXIMA_BARRA), 6);

      let color: string;
      if (mes.estado === 'pendiente') {
        color = COLOR_GRIS;
      } else if (indice === this.mesActual) {
        color = COLOR_AZUL;
      } else if (mes.ahorro >= 0) {
        color = COLOR_VERDE;
      } else {
        color = COLOR_ROJO;
      }

      return {
        nombre: mes.nombre,
        inicial: INICIALES_MESES[indice],
        ahorro: mes.ahorro,
        estado: mes.estado,
        alturaPixeles,
        color,
        indice
      };
    });
  });

  navegarAtras(): void {
    this.router.navigate(['/mas']);
  }

  navegarAnioAnterior(): void {
    this.anio.update(anioActual => anioActual - 1);
  }

  navegarAnioSiguiente(): void {
    this.anio.update(anioActual => anioActual + 1);
  }

  navegarAlMes(_indice: number): void {
    this.router.navigate(['/home']);
  }

  calcularPorcentajeProgreso(gastado: number, presupuestado: number): number {
    if (presupuestado === 0) return 0;
    return Math.min(Math.round((gastado / presupuestado) * 100), 100);
  }
}
