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
import { DeudaSection } from '../../../shared/models';
import { MONTH_NAMES } from '../../../shared/constants/months';

interface DeudaViewItem {
  id: string;
  nombre: string;
  presupuestado: number;
  real: number;
  pagado: boolean;
}

@Component({
  selector: 'app-deudas',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, BottomNavComponent],
  templateUrl: './deudas.component.html',
  styleUrl: './deudas.component.scss'
})
export class DeudasComponent {
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

  readonly deudas = toSignal(
    toObservable(this.currentMonthId).pipe(
      filter((id): id is string => id !== null),
      switchMap(id =>
        (this.sectionService.deudas.getAll(id) as ReturnType<typeof this.sectionService.deudas.getAll>).pipe(
          map(items => (items as unknown as DeudaSection[]).map((item): DeudaViewItem => ({
            id: item.id,
            nombre: item.name,
            presupuestado: item.presupuestado,
            real: item.real,
            pagado: !!(item as any)['pagado']
          })))
        )
      )
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

  readonly totalExcedido = computed(() =>
    this.totalReal() > this.totalPresupuestado()
  );

  readonly dialogVisible = signal(false);
  readonly editMode = signal(false);
  readonly editingItemId = signal<string | null>(null);
  readonly nuevoNombre = signal('');
  readonly nuevoDeudaImporte = signal<number | null>(null);
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

  diferencia(deuda: DeudaViewItem): number {
    return deuda.real - deuda.presupuestado;
  }

  isDeudaExcedida(deuda: DeudaViewItem): boolean {
    return deuda.real > deuda.presupuestado;
  }

  openDialog(): void {
    this.editMode.set(false);
    this.editingItemId.set(null);
    this.nuevoNombre.set('');
    this.nuevoDeudaImporte.set(null);
    this.editReal.set(null);
    this.dialogVisible.set(true);
  }

  openEditDialog(deuda: DeudaViewItem): void {
    this.editMode.set(true);
    this.editingItemId.set(deuda.id);
    this.nuevoNombre.set(deuda.nombre);
    this.nuevoDeudaImporte.set(deuda.presupuestado);
    this.editReal.set(deuda.real);
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  async guardarDeuda(): Promise<void> {
    const monthId = this.currentMonthId();
    const user = this.authService.currentUser;
    const nombre = this.nuevoNombre().trim();
    const importe = this.nuevoDeudaImporte();

    if (!monthId || !user || !nombre || importe === null || importe <= 0) return;

    try {
      if (this.editMode()) {
        const itemId = this.editingItemId();
        if (!itemId) return;
        await this.sectionService.deudas.update(itemId, {
          name: nombre,
          presupuestado: importe,
          real: this.editReal() ?? 0
        }, monthId);
      } else {
        await this.sectionService.deudas.add({
          month_id: monthId,
          user_id: user.uid,
          name: nombre,
          presupuestado: importe,
          real: 0,
          order_index: this.deudas().length
        });
      }
      this.closeDialog();
    } catch (error) {
      console.error('Error al guardar deuda:', error);
    }
  }

  async togglePagado(deuda: DeudaViewItem): Promise<void> {
    const monthId = this.currentMonthId();
    if (!monthId) return;
    const nowPagado = !deuda.pagado;
    try {
      await this.sectionService.deudas.update(deuda.id, {
        pagado: nowPagado,
        real: nowPagado ? deuda.presupuestado : 0
      }, monthId);
    } catch (error) {
      console.error('Error al actualizar deuda:', error);
    }
  }

  async eliminarDeuda(deuda: DeudaViewItem): Promise<void> {
    const monthId = this.currentMonthId();
    if (!monthId) return;

    const confirmado = window.confirm('¿Eliminar esta deuda?');
    if (!confirmado) return;

    try {
      await this.sectionService.deudas.remove(deuda.id, monthId);
    } catch (error) {
      console.error('Error al eliminar deuda:', error);
    }
  }
}
