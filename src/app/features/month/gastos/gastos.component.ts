import { Component, signal, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog } from 'primeng/dialog';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { filter, switchMap, map } from 'rxjs';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';
import { AuthService } from '../../../core/auth/auth.service';
import { MonthService } from '../../../shared/services/month.service';
import { SectionService } from '../../../shared/services/section.service';
import { Gasto } from '../../../shared/models';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface GastoViewItem {
  id: string;
  nombre: string;
  presupuestado: number;
  real: number;
  pagado: boolean;
}

@Component({
  selector: 'app-gastos',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, BottomNavComponent],
  templateUrl: './gastos.component.html',
  styleUrl: './gastos.component.scss'
})
export class GastosComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly monthService = inject(MonthService);
  private readonly sectionService = inject(SectionService);

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

  readonly gastos = toSignal(
    toObservable(this.currentMonthId).pipe(
      filter((id): id is string => id !== null),
      switchMap(id =>
        (this.sectionService.gastos.getAll(id) as ReturnType<typeof this.sectionService.gastos.getAll>).pipe(
          map(items => (items as unknown as Gasto[]).map((item): GastoViewItem => ({
            id: item.id,
            nombre: item.name,
            presupuestado: item.presupuestado,
            real: item.real,
            pagado: !!(item as any)['pagado']
          })))
        )
      )
    ),
    { initialValue: [] as GastoViewItem[] }
  );

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

  navigateToHome(): void {
    this.router.navigate(['/home']);
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

  diferencia(gasto: GastoViewItem): number {
    return gasto.real - gasto.presupuestado;
  }

  isGastoExcedido(gasto: GastoViewItem): boolean {
    return gasto.real > gasto.presupuestado;
  }

  openDialog(): void {
    this.editMode.set(false);
    this.editingItemId.set(null);
    this.nuevoNombre.set('');
    this.nuevoGastoImporte.set(null);
    this.editReal.set(null);
    this.dialogVisible.set(true);
  }

  openEditDialog(gasto: GastoViewItem): void {
    this.editMode.set(true);
    this.editingItemId.set(gasto.id);
    this.nuevoNombre.set(gasto.nombre);
    this.nuevoGastoImporte.set(gasto.presupuestado);
    this.editReal.set(gasto.real);
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  async guardarGasto(): Promise<void> {
    const monthId = this.currentMonthId();
    const user = this.authService.currentUser;
    const nombre = this.nuevoNombre().trim();
    const importe = this.nuevoGastoImporte();

    if (!monthId || !user || !nombre || importe === null || importe <= 0) return;

    try {
      if (this.editMode()) {
        const itemId = this.editingItemId();
        if (!itemId) return;
        await this.sectionService.gastos.update(itemId, {
          name: nombre,
          presupuestado: importe,
          real: this.editReal() ?? 0
        }, monthId);
      } else {
        await this.sectionService.gastos.add({
          month_id: monthId,
          user_id: user.uid,
          name: nombre,
          presupuestado: importe,
          real: 0,
          tipo: 'variables',
          order_index: this.gastos().length
        });
      }
      this.closeDialog();
    } catch (error) {
      console.error('Error al guardar gasto:', error);
    }
  }

  async togglePagado(gasto: GastoViewItem): Promise<void> {
    const monthId = this.currentMonthId();
    if (!monthId) return;
    const nowPagado = !gasto.pagado;
    try {
      await this.sectionService.gastos.update(gasto.id, {
        pagado: nowPagado,
        real: nowPagado ? gasto.presupuestado : 0
      }, monthId);
    } catch (error) {
      console.error('Error al actualizar gasto:', error);
    }
  }

  async eliminarGasto(gasto: GastoViewItem): Promise<void> {
    const monthId = this.currentMonthId();
    if (!monthId) return;

    const confirmado = window.confirm('¿Eliminar este gasto?');
    if (!confirmado) return;

    try {
      await this.sectionService.gastos.remove(gasto.id, monthId);
    } catch (error) {
      console.error('Error al eliminar gasto:', error);
    }
  }
}
