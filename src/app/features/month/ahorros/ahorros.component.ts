import { Component, signal, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { Dialog } from 'primeng/dialog';
import { Select } from 'primeng/select';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface AhorroItem {
  nombre: string;
  presupuestado: number;
  real: number;
  mesActual: number;
  totalMeses: number;
  objetivo: number;
}

@Component({
  selector: 'app-ahorros',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, Select, BottomNavComponent],
  templateUrl: './ahorros.component.html',
  styleUrl: './ahorros.component.scss'
})
export class AhorrosComponent {
  private readonly location = inject(Location);

  readonly mesNombre = `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`;

  readonly ahorros = signal<AhorroItem[]>([
    { nombre: 'Fondo Vacaciones', presupuestado: 100, real: 100, mesActual: 3,  totalMeses: 12, objetivo: 1200 },
    { nombre: 'Fondo Emergencia', presupuestado: 200, real: 100, mesActual: 8,  totalMeses: 24, objetivo: 4800 },
  ]);

  readonly totalReal = computed(() =>
    this.ahorros().reduce((sum, ahorro) => sum + ahorro.real, 0)
  );

  readonly totalPresupuestado = computed(() =>
    this.ahorros().reduce((sum, ahorro) => sum + ahorro.presupuestado, 0)
  );

  readonly progresoTotal = computed(() => {
    const presupuestado = this.totalPresupuestado();
    if (presupuestado === 0) return 0;
    return Math.min((this.totalReal() / presupuestado) * 100, 100);
  });

  readonly dialogVisible = signal(false);
  readonly nuevoNombre = signal('');
  readonly nuevoGastoCategoria = signal<string>('');
  readonly nuevoGastoImporte = signal<number | null>(null);
  readonly categorias = ['Ingresos', 'Facturas', 'Gastos', 'Deudas', 'Ahorros'];

  navigateBack(): void {
    this.location.back();
  }

  fondoProgresoPorcentaje(ahorro: AhorroItem): number {
    if (ahorro.totalMeses === 0) return 0;
    return Math.min((ahorro.mesActual / ahorro.totalMeses) * 100, 100);
  }

  openDialog(): void {
    this.nuevoNombre.set('');
    this.nuevoGastoCategoria.set('');
    this.nuevoGastoImporte.set(null);
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  guardarAhorro(): void {
    console.log({
      nombre: this.nuevoNombre(),
      categoria: this.nuevoGastoCategoria(),
      importe: this.nuevoGastoImporte()
    });
    this.closeDialog();
  }
}
