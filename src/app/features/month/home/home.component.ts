import { Component, signal, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Dialog } from 'primeng/dialog';
import { Select } from 'primeng/select';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { filter, switchMap, map } from 'rxjs';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';
import { AuthService } from '../../../core/auth/auth.service';
import { MonthService } from '../../../shared/services/month.service';
import { IngresosService } from '../../../shared/services/ingresos.service';
import { FacturasService } from '../../../shared/services/facturas.service';
import { SectionService } from '../../../shared/services/section.service';
import { DeudasService } from '../../../shared/services/deudas.service';
import { Ingreso, Factura, Gasto, Ahorro } from '../../../shared/models';

interface SectionBudget {
  nombre: string;
  icono: string;
  color: string;
  presupuestado: number;
  real: number;
}

interface DonutSegment {
  label: string;
  value: number;
  color: string;
  strokeDasharray: string;
  strokeDashoffset: number;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DONUT_RADIUS = 45;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, Select, BottomNavComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly monthService = inject(MonthService);
  private readonly ingresosService = inject(IngresosService);
  private readonly facturasService = inject(FacturasService);
  private readonly sectionService = inject(SectionService);
  private readonly deudasService = inject(DeudasService);

  private readonly baseYear = new Date().getFullYear();
  private readonly baseMonthIndex = new Date().getMonth();
  private monthResolutionCounter = 0;

  private readonly monthOffset = signal(0);

  readonly currentMonthIndex = computed(() => {
    const rawIndex = this.baseMonthIndex + this.monthOffset();
    return ((rawIndex % 12) + 12) % 12;
  });

  readonly currentYear = computed(() => {
    const rawIndex = this.baseMonthIndex + this.monthOffset();
    return this.baseYear + Math.floor(rawIndex / 12);
  });

  readonly mesNombre = computed(
    () => `${MONTH_NAMES[this.currentMonthIndex()]} ${this.currentYear()}`
  );

  private readonly resolvedMonthId = signal<string | null>(null);

  private readonly ingresosData = toSignal(
    toObservable(this.resolvedMonthId).pipe(
      filter((id): id is string => id !== null),
      switchMap(id => this.ingresosService.getAll(id))
    ),
    { initialValue: [] as Ingreso[] }
  );

  private readonly facturasData = toSignal(
    toObservable(this.resolvedMonthId).pipe(
      filter((id): id is string => id !== null),
      switchMap(id => this.facturasService.getAll(id))
    ),
    { initialValue: [] as Factura[] }
  );

  private readonly gastosData = toSignal(
    toObservable(this.resolvedMonthId).pipe(
      filter((id): id is string => id !== null),
      switchMap(id =>
        (this.sectionService.gastos.getAll(id) as ReturnType<typeof this.sectionService.gastos.getAll>).pipe(
          map(items => items as unknown as Gasto[])
        )
      )
    ),
    { initialValue: [] as Gasto[] }
  );

  private readonly ahorrosData = toSignal(
    toObservable(this.resolvedMonthId).pipe(
      filter((id): id is string => id !== null),
      switchMap(id =>
        (this.sectionService.ahorros.getAll(id) as ReturnType<typeof this.sectionService.ahorros.getAll>).pipe(
          map(items => items as unknown as Ahorro[])
        )
      )
    ),
    { initialValue: [] as Ahorro[] }
  );

  private readonly deudasData = toSignal(
    this.deudasService.getActiveObservable(),
    { initialValue: [] }
  );

  readonly ingresos = computed(() =>
    this.ingresosData().reduce((sum, item) => sum + item.real, 0)
  );

  readonly gastos = computed(() =>
    this.facturasData().reduce((sum, item) => sum + item.real, 0) +
    this.gastosData().reduce((sum, item) => sum + item.real, 0)
  );

  readonly ahorro = computed(() =>
    this.ahorrosData().reduce((sum, item) => sum + item.real, 0)
  );

  readonly disponible = computed(() => this.ingresos() - this.gastos() - this.ahorro());

  readonly secciones = computed((): SectionBudget[] => [
    {
      nombre: 'Ingresos',
      icono: 'pi-arrow-up-right',
      color: '#8b5cf6',
      presupuestado: this.ingresosData().reduce((sum, i) => sum + i.esperado, 0),
      real: this.ingresosData().reduce((sum, i) => sum + i.real, 0)
    },
    {
      nombre: 'Facturas',
      icono: 'pi-file',
      color: '#3b82f6',
      presupuestado: this.facturasData().reduce((sum, f) => sum + f.presupuestado, 0),
      real: this.facturasData().reduce((sum, f) => sum + f.real, 0)
    },
    {
      nombre: 'Gastos',
      icono: 'pi-shopping-cart',
      color: '#ef4444',
      presupuestado: this.gastosData().reduce((sum, g) => sum + g.presupuestado, 0),
      real: this.gastosData().reduce((sum, g) => sum + g.real, 0)
    },
    {
      nombre: 'Ahorros',
      icono: 'pi-wallet',
      color: '#22c55e',
      presupuestado: this.ahorrosData().reduce((sum, a) => sum + a.presupuestado, 0),
      real: this.ahorrosData().reduce((sum, a) => sum + a.real, 0)
    },
    {
      nombre: 'Deudas',
      icono: 'pi-credit-card',
      color: '#f59e0b',
      presupuestado: this.deudasData().reduce((sum, d) => sum + d.monthly_payment, 0),
      real: this.deudasData().reduce((sum, d) => sum + d.monthly_payment, 0)
    }
  ]);

  readonly donutSegments = computed((): DonutSegment[] => {
    const items = this.secciones();
    const total = items.reduce((sum, section) => sum + section.real, 0);

    if (total === 0) return [];

    let cumulativeLength = 0;

    return items.map((section) => {
      const segmentLength = (section.real / total) * DONUT_CIRCUMFERENCE;
      const dashOffset = -cumulativeLength;
      cumulativeLength += segmentLength;

      return {
        label: section.nombre,
        value: section.real,
        color: section.color,
        strokeDasharray: `${segmentLength.toFixed(2)} ${DONUT_CIRCUMFERENCE.toFixed(2)}`,
        strokeDashoffset: dashOffset
      };
    });
  });

  readonly totalGastos = computed(() =>
    this.secciones().reduce((sum, section) => sum + section.real, 0)
  );

  readonly nuevoGastoDialogVisible = signal(false);
  readonly nuevoGastoNombre = signal('');
  readonly nuevoGastoCategoria = signal<string>('');
  readonly nuevoGastoImporte = signal<number | null>(null);
  readonly categorias = ['Ingresos', 'Facturas', 'Gastos', 'Ahorros', 'Deudas'];

  constructor() {
    this.resolveCurrentMonth();
  }

  private resolveCurrentMonth(): void {
    const user = this.authService.currentUser;
    if (!user) return;

    const resolutionId = ++this.monthResolutionCounter;
    const year = this.currentYear();
    const month = this.currentMonthIndex() + 1;

    this.resolvedMonthId.set(null);
    this.monthService.getOrCreateMonth(user.uid, year, month)
      .then(resolvedMonth => {
        if (this.monthResolutionCounter === resolutionId) {
          this.resolvedMonthId.set(resolvedMonth.id);
        }
      })
      .catch(error => console.error('Error al resolver mes:', error));
  }

  navigateToPreviousMonth(): void {
    this.monthOffset.update(offset => offset - 1);
    this.resolveCurrentMonth();
  }

  navigateToNextMonth(): void {
    this.monthOffset.update(offset => offset + 1);
    this.resolveCurrentMonth();
  }

  sectionProgressPercentage(section: SectionBudget): number {
    if (section.presupuestado === 0) return 0;
    return Math.min((section.real / section.presupuestado) * 100, 100);
  }

  isSectionExceeded(section: SectionBudget): boolean {
    return section.real > section.presupuestado;
  }

  onAjustarPresupuestoClick(): void {
    this.router.navigate(['/planificacion']);
  }

  openNuevoGastoDialog(): void {
    this.nuevoGastoNombre.set('');
    this.nuevoGastoCategoria.set('');
    this.nuevoGastoImporte.set(null);
    this.nuevoGastoDialogVisible.set(true);
  }

  closeNuevoGastoDialog(): void {
    this.nuevoGastoDialogVisible.set(false);
  }

  async saveNuevoGasto(): Promise<void> {
    const monthId = this.resolvedMonthId();
    const user = this.authService.currentUser;
    const nombre = this.nuevoGastoNombre().trim();
    const categoria = this.nuevoGastoCategoria();
    const importe = this.nuevoGastoImporte();

    if (!user || !nombre || !categoria || importe === null || importe <= 0) return;

    try {
      switch (categoria) {
        case 'Ingresos':
          if (!monthId) return;
          await this.ingresosService.add({
            month_id: monthId,
            user_id: user.uid,
            fuente: nombre,
            esperado: importe,
            real: 0,
            dia_de_paga: null,
            depositado: false,
            order_index: this.ingresosData().length
          });
          break;

        case 'Facturas':
          if (!monthId) return;
          await this.facturasService.add({
            month_id: monthId,
            user_id: user.uid,
            name: nombre,
            fecha: null,
            presupuestado: importe,
            real: 0,
            is_recurring: false,
            order_index: this.facturasData().length
          });
          break;

        case 'Gastos':
          if (!monthId) return;
          await this.sectionService.gastos.add({
            month_id: monthId,
            user_id: user.uid,
            name: nombre,
            presupuestado: importe,
            real: 0,
            tipo: 'variables',
            order_index: this.gastosData().length
          });
          break;

        case 'Ahorros':
          if (!monthId) return;
          await this.sectionService.ahorros.add({
            month_id: monthId,
            user_id: user.uid,
            name: nombre,
            presupuestado: importe,
            real: 0,
            order_index: this.ahorrosData().length
          });
          break;

        case 'Deudas':
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
          break;
      }

      this.closeNuevoGastoDialog();
    } catch (error) {
      console.error('Error al guardar item:', error);
    }
  }
}
