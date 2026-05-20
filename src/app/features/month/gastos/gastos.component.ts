import { Component, signal, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Dialog } from 'primeng/dialog';
import { Select } from 'primeng/select';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface GastoItem {
  nombre: string;
  presupuestado: number;
  real: number;
}

@Component({
  selector: 'app-gastos',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, Select, BottomNavComponent],
  templateUrl: './gastos.component.html',
  styleUrl: './gastos.component.scss'
})
export class GastosComponent {
  private readonly router = inject(Router);

  readonly mesNombre = `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`;

  readonly gastos = signal<GastoItem[]>([
    { nombre: 'Supermercado',  presupuestado: 300, real: 320 },
    { nombre: 'Gasolina',      presupuestado: 150, real: 130 },
    { nombre: 'Restaurantes',  presupuestado: 100, real: 150 },
    { nombre: 'Ropa',          presupuestado: 50,  real: 50  },
  ]);

  readonly totalReal = computed(() =>
    this.gastos().reduce((sum, gasto) => sum + gasto.real, 0)
  );

  readonly totalPresupuestado = computed(() =>
    this.gastos().reduce((sum, gasto) => sum + gasto.presupuestado, 0)
  );

  readonly progresoTotal = computed(() => {
    const presupuestado = this.totalPresupuestado();
    if (presupuestado === 0) return 0;
    return Math.min((this.totalReal() / presupuestado) * 100, 100);
  });

  readonly totalExcedido = computed(() =>
    this.totalReal() > this.totalPresupuestado()
  );

  readonly dialogVisible = signal(false);
  readonly nuevoNombre = signal('');
  readonly nuevoGastoCategoria = signal<string>('');
  readonly nuevoGastoImporte = signal<number | null>(null);
  readonly categorias = ['Ingresos', 'Facturas', 'Gastos', 'Deudas', 'Ahorros'];

  navigateToHome(): void {
    this.router.navigate(['/home']);
  }

  diferencia(gasto: GastoItem): number {
    return gasto.real - gasto.presupuestado;
  }

  isGastoExcedido(gasto: GastoItem): boolean {
    return gasto.real > gasto.presupuestado;
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

  guardarGasto(): void {
    console.log({
      nombre: this.nuevoNombre(),
      categoria: this.nuevoGastoCategoria(),
      importe: this.nuevoGastoImporte()
    });
    this.closeDialog();
  }
}
