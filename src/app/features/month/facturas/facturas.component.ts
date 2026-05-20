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

interface FacturaItem {
  nombre: string;
  presupuestado: number;
  real: number;
  dia: string;
}

@Component({
  selector: 'app-facturas',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, Select, BottomNavComponent],
  templateUrl: './facturas.component.html',
  styleUrl: './facturas.component.scss'
})
export class FacturasComponent {
  private readonly location = inject(Location);

  readonly mesNombre = `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`;

  readonly facturas = signal<FacturaItem[]>([
    { nombre: 'Alquiler', presupuestado: 800, real: 800, dia: '1' },
    { nombre: 'Luz',      presupuestado: 80,  real: 72,  dia: '5' },
    { nombre: 'Internet', presupuestado: 40,  real: 40,  dia: '10' },
    { nombre: 'Gym',      presupuestado: 30,  real: 38,  dia: '15' },
  ]);

  readonly totalReal = computed(() =>
    this.facturas().reduce((sum, factura) => sum + factura.real, 0)
  );

  readonly totalPresupuestado = computed(() =>
    this.facturas().reduce((sum, factura) => sum + factura.presupuestado, 0)
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

  navigateBack(): void {
    this.location.back();
  }

  diferencia(factura: FacturaItem): number {
    return factura.real - factura.presupuestado;
  }

  isFacturaExcedida(factura: FacturaItem): boolean {
    return factura.real > factura.presupuestado;
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

  guardarFactura(): void {
    console.log({
      nombre: this.nuevoNombre(),
      categoria: this.nuevoGastoCategoria(),
      importe: this.nuevoGastoImporte()
    });
    this.closeDialog();
  }
}
