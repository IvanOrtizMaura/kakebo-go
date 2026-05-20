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

interface DeudaItem {
  nombre: string;
  presupuestado: number;
  real: number;
  pendiente: number;
  total: number;
  tae: number;
}

@Component({
  selector: 'app-deudas',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, Select, BottomNavComponent],
  templateUrl: './deudas.component.html',
  styleUrl: './deudas.component.scss'
})
export class DeudasComponent {
  private readonly location = inject(Location);

  readonly mesNombre = `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`;

  readonly deudas = signal<DeudaItem[]>([
    { nombre: 'Préstamo coche', presupuestado: 260, real: 260, pendiente: 8200, total: 12000, tae: 4.5 },
  ]);

  readonly totalReal = computed(() =>
    this.deudas().reduce((sum, deuda) => sum + deuda.real, 0)
  );

  readonly totalPresupuestado = computed(() =>
    this.deudas().reduce((sum, deuda) => sum + deuda.presupuestado, 0)
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

  amortizacionPorcentaje(deuda: DeudaItem): number {
    if (deuda.total === 0) return 0;
    const amortizado = deuda.total - deuda.pendiente;
    return Math.min((amortizado / deuda.total) * 100, 100);
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

  guardarDeuda(): void {
    console.log({
      nombre: this.nuevoNombre(),
      categoria: this.nuevoGastoCategoria(),
      importe: this.nuevoGastoImporte()
    });
    this.closeDialog();
  }
}
