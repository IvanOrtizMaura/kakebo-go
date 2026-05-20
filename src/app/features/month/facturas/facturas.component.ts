import { Component, signal, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { Dialog } from 'primeng/dialog';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { filter, switchMap, map } from 'rxjs';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';
import { AuthService } from '../../../core/auth/auth.service';
import { MonthService } from '../../../shared/services/month.service';
import { FacturasService } from '../../../shared/services/facturas.service';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface FacturaViewItem {
  id: string;
  nombre: string;
  presupuestado: number;
  real: number;
  dia: string | null;
}

@Component({
  selector: 'app-facturas',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, BottomNavComponent],
  templateUrl: './facturas.component.html',
  styleUrl: './facturas.component.scss'
})
export class FacturasComponent {
  private readonly location = inject(Location);
  private readonly authService = inject(AuthService);
  private readonly monthService = inject(MonthService);
  private readonly facturasService = inject(FacturasService);

  readonly mesNombre = `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`;

  private readonly currentMonthId = signal<string | null>(null);

  readonly facturas = toSignal(
    toObservable(this.currentMonthId).pipe(
      filter((id): id is string => id !== null),
      switchMap(id =>
        this.facturasService.getAll(id).pipe(
          map(items => items.map((item): FacturaViewItem => ({
            id: item.id,
            nombre: item.name,
            presupuestado: item.presupuestado,
            real: item.real,
            dia: item.fecha
          })))
        )
      )
    ),
    { initialValue: [] as FacturaViewItem[] }
  );

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
  readonly nuevoGastoImporte = signal<number | null>(null);

  constructor() {
    const user = this.authService.currentUser;
    if (user) {
      const now = new Date();
      this.monthService.getOrCreateMonth(user.uid, now.getFullYear(), now.getMonth() + 1)
        .then(month => this.currentMonthId.set(month.id))
        .catch(error => console.error('Error al cargar mes:', error));
    }
  }

  navigateBack(): void {
    this.location.back();
  }

  diferencia(factura: FacturaViewItem): number {
    return factura.real - factura.presupuestado;
  }

  isFacturaExcedida(factura: FacturaViewItem): boolean {
    return factura.real > factura.presupuestado;
  }

  openDialog(): void {
    this.nuevoNombre.set('');
    this.nuevoGastoImporte.set(null);
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  async guardarFactura(): Promise<void> {
    const monthId = this.currentMonthId();
    const user = this.authService.currentUser;
    const nombre = this.nuevoNombre().trim();
    const importe = this.nuevoGastoImporte();

    if (!monthId || !user || !nombre || importe === null || importe <= 0) return;

    try {
      await this.facturasService.add({
        month_id: monthId,
        user_id: user.uid,
        name: nombre,
        fecha: null,
        presupuestado: importe,
        real: 0,
        is_recurring: false,
        order_index: this.facturas().length
      });
      this.closeDialog();
    } catch (error) {
      console.error('Error al guardar factura:', error);
    }
  }
}
