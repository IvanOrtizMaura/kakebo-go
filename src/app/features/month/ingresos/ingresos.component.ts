import { Component, signal, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog } from 'primeng/dialog';
import { DatePicker } from 'primeng/datepicker';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { filter, switchMap, map } from 'rxjs';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';
import { AuthService } from '../../../core/auth/auth.service';
import { MonthService } from '../../../shared/services/month.service';
import { IngresosService } from '../../../shared/services/ingresos.service';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface IngresoViewItem {
  id: string;
  fuente: string;
  esperado: number;
  real: number;
  dia_paga: string | null;
  depositado: boolean;
}

@Component({
  selector: 'app-ingresos',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, DatePicker, BottomNavComponent],
  templateUrl: './ingresos.component.html',
  styleUrl: './ingresos.component.scss'
})
export class IngresosComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly monthService = inject(MonthService);
  private readonly ingresosService = inject(IngresosService);

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

  readonly ingresos = toSignal(
    toObservable(this.currentMonthId).pipe(
      filter((id): id is string => id !== null),
      switchMap(id =>
        this.ingresosService.getAll(id).pipe(
          map(items => items.map((item): IngresoViewItem => ({
            id: item.id,
            fuente: item.fuente,
            esperado: item.esperado,
            real: item.real,
            dia_paga: item.dia_de_paga,
            depositado: item.depositado
          })))
        )
      )
    ),
    { initialValue: [] as IngresoViewItem[] }
  );

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
  readonly editMode = signal(false);
  readonly editingItemId = signal<string | null>(null);
  readonly nuevoNombre = signal('');
  readonly nuevoGastoImporte = signal<number | null>(null);
  readonly editReal = signal<number | null>(null);
  readonly editDiaPagaDate = signal<Date | null>(null);

  readonly defaultPickerDate = computed(() => new Date(this.currentYear(), this.currentMonthIndex(), 1));

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

  openDialog(): void {
    this.editMode.set(false);
    this.editingItemId.set(null);
    this.nuevoNombre.set('');
    this.nuevoGastoImporte.set(null);
    this.editReal.set(null);
    this.editDiaPagaDate.set(null);
    this.dialogVisible.set(true);
  }

  openEditDialog(ingreso: IngresoViewItem): void {
    this.editMode.set(true);
    this.editingItemId.set(ingreso.id);
    this.nuevoNombre.set(ingreso.fuente);
    this.nuevoGastoImporte.set(ingreso.esperado);
    this.editReal.set(ingreso.real);
    const parsedDay = ingreso.dia_paga ? parseInt(ingreso.dia_paga) : null;
    if (parsedDay) {
      this.editDiaPagaDate.set(new Date(this.currentYear(), this.currentMonthIndex(), parsedDay));
    } else {
      this.editDiaPagaDate.set(null);
    }
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  async guardarIngreso(): Promise<void> {
    const monthId = this.currentMonthId();
    const user = this.authService.currentUser;
    const fuente = this.nuevoNombre().trim();
    const importe = this.nuevoGastoImporte();

    if (!monthId || !user || !fuente || importe === null || importe <= 0) return;

    try {
      if (this.editMode()) {
        const itemId = this.editingItemId();
        if (!itemId) return;
        await this.ingresosService.update(itemId, monthId, {
          fuente,
          esperado: importe,
          real: this.editReal() ?? 0,
          dia_de_paga: this.editDiaPagaDate() ? String(this.editDiaPagaDate()!.getDate()) : null
        });
      } else {
        await this.ingresosService.add({
          month_id: monthId,
          user_id: user.uid,
          fuente,
          esperado: importe,
          real: 0,
          dia_de_paga: this.editDiaPagaDate() ? String(this.editDiaPagaDate()!.getDate()) : null,
          depositado: false,
          order_index: this.ingresos().length
        });
      }
      this.closeDialog();
    } catch (error) {
      console.error('Error al guardar ingreso:', error);
    }
  }

  async toggleDepositado(ingreso: IngresoViewItem): Promise<void> {
    const monthId = this.currentMonthId();
    if (!monthId) return;

    try {
      const nowDeposited = !ingreso.depositado;
      await this.ingresosService.update(ingreso.id, monthId, {
        depositado: nowDeposited,
        real: nowDeposited ? ingreso.esperado : 0
      });
    } catch (error) {
      console.error('Error al actualizar ingreso:', error);
    }
  }

  async eliminarIngreso(ingreso: IngresoViewItem): Promise<void> {
    const monthId = this.currentMonthId();
    if (!monthId) return;

    const confirmado = window.confirm('¿Eliminar este ingreso?');
    if (!confirmado) return;

    try {
      await this.ingresosService.remove(ingreso.id, monthId);
    } catch (error) {
      console.error('Error al eliminar ingreso:', error);
    }
  }
}
