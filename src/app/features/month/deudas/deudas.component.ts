import { Component, signal, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { Dialog } from 'primeng/dialog';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';
import { AuthService } from '../../../core/auth/auth.service';
import { DeudasService } from '../../../shared/services/deudas.service';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface DeudaViewItem {
  id: string;
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
  imports: [CurrencyPipe, FormsModule, Dialog, BottomNavComponent],
  templateUrl: './deudas.component.html',
  styleUrl: './deudas.component.scss'
})
export class DeudasComponent {
  private readonly location = inject(Location);
  private readonly authService = inject(AuthService);
  private readonly deudasService = inject(DeudasService);

  readonly mesNombre = `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`;

  readonly deudas = toSignal(
    this.deudasService.getActiveObservable().pipe(
      map(items => items.map((item): DeudaViewItem => ({
        id: item.id,
        nombre: item.name,
        presupuestado: item.monthly_payment,
        real: item.monthly_payment,
        pendiente: item.amount_remaining,
        total: item.total_amount,
        tae: item.interest_rate
      })))
    ),
    { initialValue: [] as DeudaViewItem[] }
  );

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
  readonly nuevoGastoImporte = signal<number | null>(null);

  navigateBack(): void {
    this.location.back();
  }

  amortizacionPorcentaje(deuda: DeudaViewItem): number {
    if (deuda.total === 0) return 0;
    const amortizado = deuda.total - deuda.pendiente;
    return Math.min((amortizado / deuda.total) * 100, 100);
  }

  openDialog(): void {
    this.nuevoNombre.set('');
    this.nuevoGastoImporte.set(null);
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  async guardarDeuda(): Promise<void> {
    const user = this.authService.currentUser;
    const nombre = this.nuevoNombre().trim();
    const importe = this.nuevoGastoImporte();

    if (!user || !nombre || importe === null || importe <= 0) return;

    try {
      await this.deudasService.create({
        user_id: user.uid,
        name: nombre,
        type: 'bank',
        principal_amount: importe,
        total_amount: importe,
        interest_rate: 0,
        monthly_payment: importe,
        amount_remaining: importe,
        is_active: true
      });
      this.closeDialog();
    } catch (error) {
      console.error('Error al guardar deuda:', error);
    }
  }
}
