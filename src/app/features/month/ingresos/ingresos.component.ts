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

interface IngresoItem {
  fuente: string;
  esperado: number;
  real: number;
  dia_paga: string;
  depositado: boolean;
}

@Component({
  selector: 'app-ingresos',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, Select, BottomNavComponent],
  templateUrl: './ingresos.component.html',
  styleUrl: './ingresos.component.scss'
})
export class IngresosComponent {
  private readonly router = inject(Router);

  readonly mesNombre = `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`;

  readonly ingresos = signal<IngresoItem[]>([
    { fuente: 'Nómina',    esperado: 2100, real: 2100, dia_paga: '28', depositado: true  },
    { fuente: 'Freelance', esperado: 500,  real: 350,  dia_paga: '15', depositado: false },
  ]);

  readonly totalReal = computed(() =>
    this.ingresos().reduce((sum, ingreso) => sum + ingreso.real, 0)
  );

  readonly totalEsperado = computed(() =>
    this.ingresos().reduce((sum, ingreso) => sum + ingreso.esperado, 0)
  );

  readonly progresoTotal = computed(() => {
    const esperado = this.totalEsperado();
    if (esperado === 0) return 0;
    return Math.min((this.totalReal() / esperado) * 100, 100);
  });

  readonly dialogVisible = signal(false);
  readonly nuevoNombre = signal('');
  readonly nuevoGastoCategoria = signal<string>('');
  readonly nuevoGastoImporte = signal<number | null>(null);
  readonly categorias = ['Ingresos', 'Facturas', 'Gastos', 'Deudas', 'Ahorros'];

  navigateToHome(): void {
    this.router.navigate(['/home']);
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

  guardarIngreso(): void {
    console.log({
      nombre: this.nuevoNombre(),
      categoria: this.nuevoGastoCategoria(),
      importe: this.nuevoGastoImporte()
    });
    this.closeDialog();
  }
}
