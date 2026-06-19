import { Component, signal, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Dialog } from 'primeng/dialog';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { filter, switchMap, map } from 'rxjs';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';
import { AuthService } from '../../../core/auth/auth.service';
import { MonthService } from '../../../shared/services/month.service';
import { FacturasService } from '../../../shared/services/facturas.service';
import { MONTH_NAMES } from '../../../shared/constants/months';

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
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly authService = inject(AuthService);
  private readonly monthService = inject(MonthService);
  private readonly facturasService = inject(FacturasService);

  private readonly baseYear = new Date().getFullYear();
  private readonly baseMonthIndex = new Date().getMonth();
  readonly monthOffset = signal(this.calculateInitialOffset());

  readonly currentMonthIndex = computed(() => {
    const rawIndex = this.baseMonthIndex + this.monthOffset();
    return ((rawIndex % 12) + 12) % 12;
  });

  readonly currentYear = computed(() => {
    const rawIndex = this.baseMonthIndex + this.monthOffset();
    return this.baseYear + Math.floor(rawIndex / 12);
  });

  readonly mesNombre = computed(() => `${MONTH_NAMES[this.currentMonthIndex()]} ${this.currentYear()}`);

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
  readonly editMode = signal(false);
  readonly editingItemId = signal<string | null>(null);
  readonly nuevoNombre = signal('');
  readonly nuevoGastoImporte = signal<number | null>(null);
  readonly editReal = signal<number | null>(null);

  constructor() {
    const user = this.authService.currentUser;
    if (user) {
      this.loadMonth(user.uid, this.currentYear(), this.currentMonthIndex() + 1);
    }
  }

  private calculateInitialOffset(): number {
    const params = this.route.snapshot.queryParams;
    if (params['year'] && params['month'] !== undefined) {
      const targetYear = +params['year'];
      const targetMonth = +params['month'];
      const currentTotalMonths = this.baseYear * 12 + this.baseMonthIndex;
      const targetTotalMonths = targetYear * 12 + targetMonth;
      return targetTotalMonths - currentTotalMonths;
    }
    return 0;
  }

  navigateBack(): void {
    this.location.back();
  }

  navigateToPreviousMonth(): void {
    const user = this.authService.currentUser;
    if (!user) return;
    this.monthOffset.update(offset => offset - 1);
    this.loadMonth(user.uid, this.currentYear(), this.currentMonthIndex() + 1);
  }

  navigateToNextMonth(): void {
    const user = this.authService.currentUser;
    if (!user) return;
    this.monthOffset.update(offset => offset + 1);
    this.loadMonth(user.uid, this.currentYear(), this.currentMonthIndex() + 1);
  }

  goToToday(): void {
    const user = this.authService.currentUser;
    if (!user) return;
    this.monthOffset.set(0);
    this.loadMonth(user.uid, this.currentYear(), this.currentMonthIndex() + 1);
  }

  private loadMonth(userId: string, year: number, month: number): void {
    this.monthService.getOrCreateMonth(userId, year, month)
      .then(monthData => this.currentMonthId.set(monthData.id))
      .catch(error => console.error('Error al cargar mes:', error));
  }

  diferencia(factura: FacturaViewItem): number {
    return factura.real - factura.presupuestado;
  }

  isFacturaExcedida(factura: FacturaViewItem): boolean {
    return factura.real > factura.presupuestado;
  }

  openDialog(): void {
    this.editMode.set(false);
    this.editingItemId.set(null);
    this.nuevoNombre.set('');
    this.nuevoGastoImporte.set(null);
    this.editReal.set(null);
    this.dialogVisible.set(true);
  }

  openEditDialog(factura: FacturaViewItem): void {
    this.editMode.set(true);
    this.editingItemId.set(factura.id);
    this.nuevoNombre.set(factura.nombre);
    this.nuevoGastoImporte.set(factura.presupuestado);
    this.editReal.set(factura.real);
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
      if (this.editMode()) {
        const itemId = this.editingItemId();
        if (!itemId) return;
        await this.facturasService.update(itemId, monthId, {
          name: nombre,
          presupuestado: importe,
          real: this.editReal() ?? 0
        });
      } else {
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
      }
      this.closeDialog();
    } catch (error) {
      console.error('Error al guardar factura:', error);
    }
  }

  async togglePagada(factura: FacturaViewItem): Promise<void> {
    const monthId = this.currentMonthId();
    if (!monthId) return;

    try {
      const newReal = factura.real > 0 ? 0 : factura.presupuestado;
      await this.facturasService.update(factura.id, monthId, { real: newReal });
    } catch (error) {
      console.error('Error al actualizar factura:', error);
    }
  }

  async eliminarFactura(factura: FacturaViewItem): Promise<void> {
    const monthId = this.currentMonthId();
    if (!monthId) return;

    const confirmado = window.confirm('¿Eliminar esta factura?');
    if (!confirmado) return;

    try {
      await this.facturasService.remove(factura.id, monthId);
    } catch (error) {
      console.error('Error al eliminar factura:', error);
    }
  }
}
