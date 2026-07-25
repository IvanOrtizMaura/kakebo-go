import { Component, signal, computed, inject, OnDestroy } from '@angular/core';
import { CurrencyPipe, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog } from 'primeng/dialog';
import { Select } from 'primeng/select';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { MonthService } from '../../shared/services/month.service';
import { IngresosService } from '../../shared/services/ingresos.service';
import { FacturasService } from '../../shared/services/facturas.service';
import { SectionService } from '../../shared/services/section.service';
import { FondosAhorroService } from '../../shared/services/fondos-ahorro.service';
import {
  Ingreso,
  Factura,
  Gasto,
  Ahorro,
  Pareja,
  DeudaSection,
  FondoAhorro,
  FondoAhorroMonthly
} from '../../shared/models';
import { MONTH_NAMES } from '../../shared/constants/months';

interface SidebarMonth {
  index: number;
  name: string;
  hasData: boolean;
  isActive: boolean;
}

interface KpiCard {
  label: string;
  value: number;
  variant: 'default' | 'accent';
  isCurrency: boolean;
  suffix?: string;
}

interface DonutSegment {
  label: string;
  value: number;
  color: string;
  strokeDasharray: string;
  strokeDashoffset: number;
  percentage: number;
}

interface CategoryTable {
  key: string;
  title: string;
  color: string;
  tintBackground: string;
  totalReal: number;
  totalPresupuestado: number;
  rows: CategoryRow[];
}

interface CategoryRow {
  id: string;
  name: string;
  presupuestado: number;
  real: number;
  diferencia: number;
}

interface DonutCategory {
  key: string;
  label: string;
  color: string;
  value: number;
}

const DONUT_RADIUS = 45;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const DONUT_CX = 93;
const DONUT_CY = 93;
const DONUT_STROKE = 30;

const RING_RADIUS = 65;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_CX = 75;
const RING_CY = 75;

const CATEGORY_COLORS: Record<string, { color: string; tint: string }> = {
  facturas: { color: 'rgb(248,159,52)', tint: 'rgb(255,246,235)' },
  gastos: { color: 'rgb(88,168,186)', tint: 'rgb(236,248,250)' },
  ahorros: { color: 'rgb(96,168,68)', tint: 'rgb(238,248,232)' },
  pareja: { color: 'rgb(152,113,187)', tint: 'rgb(245,239,251)' },
  fondos: { color: 'rgb(26,122,178)', tint: 'rgb(229,240,246)' },
  deudas: { color: 'rgb(200,72,68)', tint: 'rgb(252,236,235)' }
};

type DestinationTable = 'ingresos' | 'facturas' | 'gastos' | 'ahorros' | 'pareja' | 'fondos';

interface DestinationOption {
  label: string;
  value: DestinationTable;
}

type EditDialogType = 'ingreso' | 'factura' | 'gasto' | 'ahorro' | 'pareja' | 'deuda';

interface EditDialogState {
  type: EditDialogType;
  row: Record<string, unknown>;
}

@Component({
  selector: 'app-desktop',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, Select],
  templateUrl: './desktop.component.html',
  styleUrl: './desktop.component.scss'
})
export class DesktopComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly authService = inject(AuthService);
  private readonly monthService = inject(MonthService);
  private readonly ingresosService = inject(IngresosService);
  private readonly facturasService = inject(FacturasService);
  private readonly sectionService = inject(SectionService);
  private readonly fondosAhorroService = inject(FondosAhorroService);

  readonly donutCX = DONUT_CX;
  readonly donutCY = DONUT_CY;
  readonly donutR = DONUT_RADIUS;
  readonly donutStrokeWidth = DONUT_STROKE;

  readonly ringCX = RING_CX;
  readonly ringCY = RING_CY;
  readonly ringR = RING_RADIUS;
  readonly ringCircumference = RING_CIRCUMFERENCE;

  private readonly today = new Date();
  private readonly baseYear = this.today.getFullYear();
  private readonly baseMonthIndex = this.today.getMonth();

  readonly selectedYear = signal(this.baseYear);
  readonly selectedMonthIndex = signal(this.readInitialMonthIndex());

  private readonly monthDataPresence = signal<Record<number, boolean>>({});
  private subs: Subscription[] = [];

  private readonly ingresosData = signal<Ingreso[]>([]);
  private readonly facturasData = signal<Factura[]>([]);
  private readonly gastosData = signal<Gasto[]>([]);
  private readonly ahorrosData = signal<Ahorro[]>([]);
  private readonly parejaData = signal<Pareja[]>([]);
  private readonly deudasData = signal<DeudaSection[]>([]);
  private readonly fondosActive = signal<FondoAhorro[]>([]);
  private readonly fondosMonthly = signal<FondoAhorroMonthly[]>([]);
  private readonly resolvedMonthId = signal<string | null>(null);
  readonly monthExists = signal<boolean>(false);
  readonly monthLoading = signal<boolean>(false);
  readonly isCopying = signal<boolean>(false);
  readonly copyMessage = signal<{ text: string; type: 'success' | 'error' } | null>(null);

  readonly currentMonthName = computed(() => MONTH_NAMES[this.selectedMonthIndex()]);

  readonly sidebarMonths = computed<SidebarMonth[]>(() => {
    const activeIndex = this.selectedMonthIndex();
    const presence = this.monthDataPresence();
    return MONTH_NAMES.map((name, index) => ({
      index,
      name,
      hasData: presence[index] ?? false,
      isActive: index === activeIndex
    }));
  });

  readonly totalIngresosEsperado = computed(() =>
    this.ingresosData().reduce((sum, item) => sum + (item.esperado || 0), 0)
  );

  readonly totalIngresos = computed(() =>
    this.ingresosData().reduce((sum, item) => sum + (item.real || 0), 0)
  );

  readonly totalFacturasReal = computed(() =>
    this.facturasData().reduce((sum, item) => sum + (item.real || 0), 0)
  );

  readonly totalFacturasPresupuestado = computed(() =>
    this.facturasData().reduce((sum, item) => sum + (item.presupuestado || 0), 0)
  );

  readonly totalGastosSectionReal = computed(() =>
    this.gastosData().reduce((sum, item) => sum + (item.real || 0), 0)
  );

  readonly totalGastosSectionPresupuestado = computed(() =>
    this.gastosData().reduce((sum, item) => sum + (item.presupuestado || 0), 0)
  );

  readonly totalAhorrosReal = computed(() =>
    this.ahorrosData().reduce((sum, item) => sum + (item.real || 0), 0)
  );

  readonly totalAhorrosPresupuestado = computed(() =>
    this.ahorrosData().reduce((sum, item) => sum + (item.presupuestado || 0), 0)
  );

  readonly totalParejaReal = computed(() =>
    this.parejaData().reduce((sum, item) => sum + (item.real || 0), 0)
  );

  readonly totalParejaPresupuestado = computed(() =>
    this.parejaData().reduce((sum, item) => sum + (item.presupuestado || 0), 0)
  );

  readonly totalDeudasReal = computed(() =>
    this.deudasData().reduce((sum, item) => sum + (item.real || 0), 0)
  );

  readonly fondosCombined = computed<CategoryRow[]>(() => {
    const monthly = this.fondosMonthly();
    return this.fondosActive().map(fondo => {
      const monthEntry = monthly.find(m => m.fondo_id === fondo.id);
      const real = monthEntry?.real ?? 0;
      const presupuestado = monthEntry?.presupuestado ?? fondo.monthly_amount ?? 0;
      return {
        id: fondo.id,
        name: fondo.name,
        presupuestado,
        real,
        diferencia: presupuestado - real
      };
    });
  });

  readonly totalFondosReal = computed(() =>
    this.fondosCombined().reduce((sum, row) => sum + row.real, 0)
  );

  readonly totalFondosPresupuestado = computed(() =>
    this.fondosCombined().reduce((sum, row) => sum + row.presupuestado, 0)
  );

  readonly totalGastos = computed(() =>
    this.totalFacturasReal() +
    this.totalGastosSectionReal() +
    this.totalAhorrosReal() +
    this.totalParejaReal() +
    this.totalFondosReal() +
    this.totalDeudasReal()
  );

  readonly quedaPorGastar = computed(() => {
    const presupuestado =
      this.totalFacturasPresupuestado() +
      this.totalGastosSectionPresupuestado() +
      this.totalAhorrosPresupuestado() +
      this.totalParejaPresupuestado() +
      this.totalFondosPresupuestado();
    return presupuestado - this.totalGastos();
  });

  readonly quedaParaPresupuestar = computed(() => {
    const presupuestado =
      this.totalFacturasPresupuestado() +
      this.totalGastosSectionPresupuestado() +
      this.totalAhorrosPresupuestado() +
      this.totalParejaPresupuestado() +
      this.totalFondosPresupuestado();
    return this.totalIngresosEsperado() - presupuestado;
  });

  readonly diasParaCobrar = computed(() => {
    const pending = this.ingresosData().filter(item => !item.depositado && item.dia_de_paga);
    if (!pending.length) return null;
    const referenceYear = this.selectedYear();
    const referenceMonth = this.selectedMonthIndex();
    const now = new Date();
    let closestDays: number | null = null;
    for (const item of pending) {
      const day = Number(item.dia_de_paga);
      if (Number.isNaN(day) || day <= 0) continue;
      const payDate = new Date(referenceYear, referenceMonth, day);
      const diff = Math.ceil((payDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diff < 0) continue;
      if (closestDays === null || diff < closestDays) closestDays = diff;
    }
    return closestDays;
  });

  readonly kpiCards = computed<KpiCard[]>(() => {
    const dias = this.diasParaCobrar();
    return [
      { label: 'Ingresos totales', value: this.totalIngresos(), variant: 'default', isCurrency: true },
      { label: 'Gastos totales', value: this.totalGastos(), variant: 'default', isCurrency: true },
      { label: 'Queda por gastar', value: this.quedaPorGastar(), variant: 'default', isCurrency: true },
      { label: 'Queda para presupuestar', value: this.quedaParaPresupuestar(), variant: 'default', isCurrency: true },
      {
        label: 'Días para cobrar',
        value: dias ?? 0,
        variant: 'accent',
        isCurrency: false,
        suffix: dias === null ? '—' : dias === 1 ? 'día' : 'días'
      }
    ];
  });

  readonly donutCategories = computed<DonutCategory[]>(() => [
    { key: 'facturas', label: 'Facturas', color: CATEGORY_COLORS['facturas'].color, value: this.totalFacturasReal() },
    { key: 'gastos', label: 'Gastos', color: CATEGORY_COLORS['gastos'].color, value: this.totalGastosSectionReal() },
    { key: 'ahorros', label: 'Ahorros', color: CATEGORY_COLORS['ahorros'].color, value: this.totalAhorrosReal() },
    { key: 'pareja', label: 'Pareja', color: CATEGORY_COLORS['pareja'].color, value: this.totalParejaReal() },
    { key: 'fondos', label: 'Fondos de ahorro', color: CATEGORY_COLORS['fondos'].color, value: this.totalFondosReal() }
  ]);

  readonly donutSegments = computed<DonutSegment[]>(() => {
    const items = this.donutCategories().filter(item => item.value > 0);
    const total = items.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return [];

    let cumulativeAngle = 0;
    return items.map(item => {
      const ratio = item.value / total;
      const segmentLength = ratio * DONUT_CIRCUMFERENCE;
      const offset = -cumulativeAngle * DONUT_CIRCUMFERENCE;
      cumulativeAngle += ratio;
      return {
        label: item.label,
        value: item.value,
        color: item.color,
        strokeDasharray: `${segmentLength.toFixed(2)} ${DONUT_CIRCUMFERENCE.toFixed(2)}`,
        strokeDashoffset: offset,
        percentage: Math.round(ratio * 100)
      };
    });
  });

  readonly ahorroObjetivo = computed(() => {
    const presupuestado = this.totalAhorrosPresupuestado() + this.totalFondosPresupuestado();
    const real = this.totalAhorrosReal() + this.totalFondosReal();
    const percentage = presupuestado > 0 ? Math.min(100, Math.round((real / presupuestado) * 100)) : 0;
    const dashOffset = RING_CIRCUMFERENCE - (percentage / 100) * RING_CIRCUMFERENCE;
    return { presupuestado, real, percentage, dashOffset };
  });

  readonly resumenPresupuesto = computed(() => {
    const rows = [
      { fuente: 'Facturas', presupuestado: this.totalFacturasPresupuestado(), real: this.totalFacturasReal() },
      { fuente: 'Gastos', presupuestado: this.totalGastosSectionPresupuestado(), real: this.totalGastosSectionReal() },
      { fuente: 'Ahorros', presupuestado: this.totalAhorrosPresupuestado(), real: this.totalAhorrosReal() },
      { fuente: 'Pareja', presupuestado: this.totalParejaPresupuestado(), real: this.totalParejaReal() },
      { fuente: 'Fondos', presupuestado: this.totalFondosPresupuestado(), real: this.totalFondosReal() }
    ];
    const totalPresupuestado = rows.reduce((sum, row) => sum + row.presupuestado, 0);
    const totalReal = rows.reduce((sum, row) => sum + row.real, 0);
    return { rows, totalPresupuestado, totalReal };
  });

  readonly categoryTables = computed<CategoryTable[]>(() => [
    this.buildCategoryTable('facturas', 'Facturas', this.facturasData().map(f => ({
      id: f.id,
      name: f.name,
      presupuestado: f.presupuestado || 0,
      real: f.real || 0,
      diferencia: (f.presupuestado || 0) - (f.real || 0)
    }))),
    this.buildCategoryTable('gastos', 'Gastos', this.gastosData().map(g => ({
      id: g.id,
      name: g.name,
      presupuestado: g.presupuestado || 0,
      real: g.real || 0,
      diferencia: (g.presupuestado || 0) - (g.real || 0)
    }))),
    this.buildCategoryTable('ahorros', 'Ahorros', this.ahorrosData().map(a => ({
      id: a.id,
      name: a.name,
      presupuestado: a.presupuestado || 0,
      real: a.real || 0,
      diferencia: (a.presupuestado || 0) - (a.real || 0)
    }))),
    this.buildCategoryTable('pareja', 'Pareja', this.parejaData().map(p => ({
      id: p.id,
      name: p.name,
      presupuestado: p.presupuestado || 0,
      real: p.real || 0,
      diferencia: (p.presupuestado || 0) - (p.real || 0)
    }))),
    this.buildCategoryTable('fondos', 'Fondos de ahorro', this.fondosCombined())
  ]);

  private buildCategoryTable(key: string, title: string, rows: CategoryRow[]): CategoryTable {
    const palette = CATEGORY_COLORS[key];
    const totalPresupuestado = rows.reduce((sum, row) => sum + row.presupuestado, 0);
    const totalReal = rows.reduce((sum, row) => sum + row.real, 0);
    return {
      key,
      title,
      color: palette.color,
      tintBackground: palette.tint,
      totalPresupuestado,
      totalReal,
      rows: [...rows].sort((a, b) => b.presupuestado - a.presupuestado)
    };
  }

  readonly searchTerm = signal('');
  readonly addMovementDialogVisible = signal(false);
  readonly newMovementDestination = signal<DestinationTable | null>(null);
  readonly newMovementDescription = signal('');
  readonly newMovementAmount = signal<number | null>(null);
  readonly newMovementMode = signal<'real' | 'plan'>('real');
  readonly newMovementFondoId = signal<string | null>(null);

  readonly activeFondoOptions = computed(() =>
    this.fondosActive().map(f => ({ label: f.name, value: f.id }))
  );

  readonly destinationOptions: DestinationOption[] = [
    { label: 'Ingresos', value: 'ingresos' },
    { label: 'Facturas', value: 'facturas' },
    { label: 'Gastos', value: 'gastos' },
    { label: 'Ahorros', value: 'ahorros' },
    { label: 'Pareja', value: 'pareja' },
    { label: 'Fondos de ahorro', value: 'fondos' }
  ];

  readonly canSubmitMovement = computed(() => {
    const destination = this.newMovementDestination();
    const amount = this.newMovementAmount();
    if (!destination || amount === null || amount <= 0) return false;
    if (destination === 'fondos') return !!this.newMovementFondoId();
    return this.newMovementDescription().trim().length > 0;
  });

  readonly editDialog = signal<EditDialogState | null>(null);
  readonly editSaving = signal(false);
  readonly editFormValues = signal<Record<string, unknown>>({});

  constructor() {
    const user = this.authService.currentUser;
    if (user) {
      this.loadMonthData(user.uid, this.selectedYear(), this.selectedMonthIndex() + 1);
      this.loadYearPresence(user.uid, this.selectedYear());
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(subscription => subscription.unsubscribe());
  }

  private readInitialMonthIndex(): number {
    const params = this.route.snapshot.queryParams;
    if (params['month'] !== undefined) {
      const parsed = Number(params['month']);
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed < 12) return parsed;
    }
    return this.baseMonthIndex;
  }

  selectMonth(monthIndex: number): void {
    const user = this.authService.currentUser;
    if (!user) return;
    if (monthIndex === this.selectedMonthIndex()) return;
    this.selectedMonthIndex.set(monthIndex);
    this.updateUrlParams();
    this.loadMonthData(user.uid, this.selectedYear(), monthIndex + 1);
  }

  private updateUrlParams(): void {
    const year = this.selectedYear();
    const month = this.selectedMonthIndex();
    this.location.replaceState('/desktop', `year=${year}&month=${month}`);
  }

  private async loadMonthData(userId: string, year: number, month: number): Promise<void> {
    this.subs.forEach(subscription => subscription.unsubscribe());
    this.subs = [];

    this.ingresosData.set([]);
    this.facturasData.set([]);
    this.gastosData.set([]);
    this.ahorrosData.set([]);
    this.parejaData.set([]);
    this.deudasData.set([]);
    this.fondosMonthly.set([]);
    this.resolvedMonthId.set(null);
    this.monthLoading.set(true);

    try {
      const resolvedMonth = await this.monthService.getOrCreateMonth(userId, year, month);
      const monthId = resolvedMonth.id;
      this.resolvedMonthId.set(monthId);
      this.monthExists.set(true);

      this.subs.push(
        this.ingresosService.getAll(monthId).subscribe(items => this.ingresosData.set(items)),
        this.facturasService.getAll(monthId).subscribe(items => this.facturasData.set(items)),
        this.sectionService.gastos.getAll(monthId).subscribe(items => this.gastosData.set(items as unknown as Gasto[])),
        this.sectionService.ahorros.getAll(monthId).subscribe(items => this.ahorrosData.set(items as unknown as Ahorro[])),
        this.sectionService.pareja.getAll(monthId).subscribe(items => this.parejaData.set(items as unknown as Pareja[])),
        this.sectionService.deudas.getAll(monthId).subscribe(items => this.deudasData.set(items as unknown as DeudaSection[]))
      );

      const [fondosActive, fondosMonthly] = await Promise.all([
        this.fondosAhorroService.getActive(userId),
        this.fondosAhorroService.getMonthlyByMonth(monthId)
      ]);
      this.fondosActive.set(fondosActive);
      this.fondosMonthly.set(fondosMonthly);

      this.monthDataPresence.update(current => ({ ...current, [month - 1]: true }));
    } catch (error) {
      console.error('Error cargando datos del mes:', error);
      this.monthExists.set(false);
    } finally {
      this.monthLoading.set(false);
    }
  }

  private async loadYearPresence(userId: string, year: number): Promise<void> {
    try {
      const months = await this.monthService.getMonthsForYear(userId, year);
      const map: Record<number, boolean> = {};
      months.forEach(month => {
        map[month.month - 1] = true;
      });
      this.monthDataPresence.set(map);
    } catch (error) {
      console.error('Error cargando presencia anual:', error);
    }
  }

  filteredIngresos = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const items = this.ingresosData();
    if (!term) return items;
    return items.filter(item => item.fuente.toLowerCase().includes(term));
  });

  hasMonthData = computed(() =>
    this.ingresosData().length > 0 ||
    this.facturasData().length > 0 ||
    this.gastosData().length > 0 ||
    this.ahorrosData().length > 0 ||
    this.parejaData().length > 0 ||
    this.fondosActive().length > 0
  );

  openAddMovementDialog(): void {
    this.newMovementDestination.set(null);
    this.newMovementDescription.set('');
    this.newMovementAmount.set(null);
    this.newMovementMode.set('real');
    this.newMovementFondoId.set(null);
    this.addMovementDialogVisible.set(true);
  }

  closeAddMovementDialog(): void {
    this.addMovementDialogVisible.set(false);
  }

  async submitNewMovement(): Promise<void> {
    if (!this.canSubmitMovement()) return;

    const user = this.authService.currentUser;
    const monthId = this.resolvedMonthId();
    if (!user || !monthId) return;

    const destination = this.newMovementDestination() as DestinationTable;
    const description = this.newMovementDescription().trim();
    const amount = this.newMovementAmount() as number;
    const isPlan = this.newMovementMode() === 'plan';
    const realVal = isPlan ? 0 : amount;
    const presupuestoVal = amount;

    try {
      switch (destination) {
        case 'ingresos':
          await this.ingresosService.add({
            month_id: monthId,
            user_id: user.uid,
            fuente: description,
            esperado: presupuestoVal,
            real: realVal,
            dia_de_paga: null,
            depositado: !isPlan,
            order_index: this.ingresosData().length
          });
          break;
        case 'facturas':
          await this.facturasService.add({
            month_id: monthId,
            user_id: user.uid,
            name: description,
            fecha: null,
            presupuestado: presupuestoVal,
            real: realVal,
            is_recurring: false,
            order_index: this.facturasData().length
          });
          break;
        case 'gastos':
          await this.sectionService.gastos.add({
            month_id: monthId,
            user_id: user.uid,
            name: description,
            presupuestado: presupuestoVal,
            real: realVal,
            tipo: 'variables',
            order_index: this.gastosData().length
          });
          break;
        case 'ahorros':
          await this.sectionService.ahorros.add({
            month_id: monthId,
            user_id: user.uid,
            name: description,
            presupuestado: presupuestoVal,
            real: realVal,
            order_index: this.ahorrosData().length
          });
          break;
        case 'pareja':
          await this.sectionService.pareja.add({
            month_id: monthId,
            user_id: user.uid,
            name: description,
            presupuestado: presupuestoVal,
            real: realVal,
            order_index: this.parejaData().length
          });
          break;
        case 'fondos': {
          const fondoId = this.newMovementFondoId();
          const target = this.fondosActive().find(f => f.id === fondoId);
          if (!target) {
            console.warn('Selecciona un fondo de ahorro.');
            return;
          }
          await this.fondosAhorroService.upsertMonthly({
            fondo_id: target.id,
            month_id: monthId,
            user_id: user.uid,
            presupuestado: isPlan ? amount : (target.monthly_amount ?? 0),
            real: realVal
          });
          const refreshed = await this.fondosAhorroService.getMonthlyByMonth(monthId);
          this.fondosMonthly.set(refreshed);
          break;
        }
      }
      this.closeAddMovementDialog();
    } catch (error) {
      console.error('Error añadiendo movimiento:', error);
    }
  }

  async startCurrentMonth(): Promise<void> {
    const user = this.authService.currentUser;
    if (!user) return;
    await this.loadMonthData(user.uid, this.selectedYear(), this.selectedMonthIndex() + 1);
  }

  private showCopyMessage(text: string, type: 'success' | 'error'): void {
    this.copyMessage.set({ text, type });
    setTimeout(() => this.copyMessage.set(null), 3500);
  }

  async copyFromPreviousMonth(): Promise<void> {
    const user = this.authService.currentUser;
    if (!user || this.isCopying()) return;
    this.isCopying.set(true);
    try {
      // Search backwards for the most recent month with data
      let previousMonth = null;
      for (let offset = 1; offset <= 12; offset++) {
        const targetMonth = this.selectedMonthIndex() + 1 - offset;
        const targetYear = targetMonth <= 0
          ? this.selectedYear() - 1
          : this.selectedYear();
        const normalizedMonth = targetMonth <= 0 ? targetMonth + 12 : targetMonth;
        const candidate = await this.monthService.findMonth(user.uid, targetYear, normalizedMonth);
        if (candidate) { previousMonth = candidate; break; }
      }

      if (!previousMonth) {
        this.showCopyMessage('No hay meses anteriores con datos para copiar.', 'error');
        return;
      }

      const currentMonth = await this.monthService.getOrCreateMonth(
        user.uid,
        this.selectedYear(),
        this.selectedMonthIndex() + 1
      );

      await Promise.all([
        this.copySectionFromPrevious('gastos', previousMonth.id, currentMonth.id, user.uid),
        this.copySectionFromPrevious('ahorros', previousMonth.id, currentMonth.id, user.uid),
        this.copySectionFromPrevious('pareja', previousMonth.id, currentMonth.id, user.uid),
        this.copySectionFromPrevious('deudas', previousMonth.id, currentMonth.id, user.uid)
      ]);

      await this.loadMonthData(user.uid, this.selectedYear(), this.selectedMonthIndex() + 1);
      this.showCopyMessage('✅ Mes copiado correctamente.', 'success');
    } catch (error) {
      console.error('Error copiando mes anterior:', error);
      this.showCopyMessage('Error al copiar el mes. Inténtalo de nuevo.', 'error');
    } finally {
      this.isCopying.set(false);
    }
  }

  private async copySectionFromPrevious(
    section: 'gastos' | 'ahorros' | 'pareja' | 'deudas',
    previousMonthId: string,
    currentMonthId: string,
    userId: string
  ): Promise<void> {
    const previousRows = await this.sectionService[section].getByMonth(previousMonthId);
    const currentRows = await this.sectionService[section].getByMonth(currentMonthId);
    const currentRowNames = new Set(currentRows.map(row => row['name'] as string));

    for (const row of previousRows) {
      const name = row['name'] as string;
      if (currentRowNames.has(name)) continue;
      const copy: Record<string, unknown> = { ...row };
      delete copy['id'];
      copy['month_id'] = currentMonthId;
      copy['user_id'] = userId;
      copy['real'] = 0;
      await this.sectionService[section].add(copy);
    }
  }

  async deleteIngreso(id: string): Promise<void> {
    const monthId = this.resolvedMonthId();
    if (!monthId) return;
    try {
      await this.ingresosService.remove(id, monthId);
    } catch (error) {
      console.error('Error eliminando ingreso:', error);
    }
  }

  async deleteCategoryRow(categoryKey: string, id: string): Promise<void> {
    const monthId = this.resolvedMonthId();
    if (!monthId) return;
    try {
      switch (categoryKey) {
        case 'facturas':
          await this.facturasService.remove(id, monthId);
          break;
        case 'gastos':
          await this.sectionService.gastos.remove(id, monthId);
          break;
        case 'ahorros':
          await this.sectionService.ahorros.remove(id, monthId);
          break;
        case 'pareja':
          await this.sectionService.pareja.remove(id, monthId);
          break;
      }
    } catch (error) {
      console.error('Error eliminando fila:', error);
    }
  }

  isDeletableCategory(categoryKey: string): boolean {
    return categoryKey === 'facturas' ||
      categoryKey === 'gastos' ||
      categoryKey === 'ahorros' ||
      categoryKey === 'pareja';
  }

  isEditableCategory(categoryKey: string): boolean {
    return this.isDeletableCategory(categoryKey);
  }

  onCategoryRowClick(categoryKey: string, row: CategoryRow): void {
    if (!this.isEditableCategory(categoryKey)) return;
    const sourceRow = this.findSourceRow(categoryKey, row.id);
    if (!sourceRow) return;
    switch (categoryKey) {
      case 'facturas':
        this.openEditDialog('factura', sourceRow);
        break;
      case 'gastos':
        this.openEditDialog('gasto', sourceRow);
        break;
      case 'ahorros':
        this.openEditDialog('ahorro', sourceRow);
        break;
      case 'pareja':
        this.openEditDialog('pareja', sourceRow);
        break;
    }
  }

  private findSourceRow(categoryKey: string, id: string): Record<string, unknown> | null {
    switch (categoryKey) {
      case 'facturas': {
        const found = this.facturasData().find(item => item.id === id);
        return found ? (found as unknown as Record<string, unknown>) : null;
      }
      case 'gastos': {
        const found = this.gastosData().find(item => item.id === id);
        return found ? (found as unknown as Record<string, unknown>) : null;
      }
      case 'ahorros': {
        const found = this.ahorrosData().find(item => item.id === id);
        return found ? (found as unknown as Record<string, unknown>) : null;
      }
      case 'pareja': {
        const found = this.parejaData().find(item => item.id === id);
        return found ? (found as unknown as Record<string, unknown>) : null;
      }
      default:
        return null;
    }
  }

  openEditDialog(type: EditDialogType, row: object): void {
    const normalized = row as Record<string, unknown>;
    this.editDialog.set({ type, row: normalized });
    this.editFormValues.set(this.buildInitialEditValues(type, normalized));
  }

  closeEditDialog(): void {
    this.editDialog.set(null);
    this.editFormValues.set({});
  }

  updateEditField(field: string, value: unknown): void {
    this.editFormValues.update(current => ({ ...current, [field]: value }));
  }

  private buildInitialEditValues(type: EditDialogType, row: Record<string, unknown>): Record<string, unknown> {
    switch (type) {
      case 'ingreso':
        return {
          fuente: (row['fuente'] as string) ?? '',
          dia_de_paga: (row['dia_de_paga'] as string) ?? '',
          esperado: (row['esperado'] as number) ?? 0,
          real: (row['real'] as number) ?? 0,
          depositado: (row['depositado'] as boolean) ?? false
        };
      case 'factura':
        return {
          name: (row['name'] as string) ?? '',
          fecha: (row['fecha'] as string) ?? '',
          presupuestado: (row['presupuestado'] as number) ?? 0,
          real: (row['real'] as number) ?? 0,
          is_recurring: (row['is_recurring'] as boolean) ?? false
        };
      case 'gasto':
        return {
          name: (row['name'] as string) ?? '',
          presupuestado: (row['presupuestado'] as number) ?? 0,
          real: (row['real'] as number) ?? 0,
          tipo: (row['tipo'] as string) ?? 'variables'
        };
      case 'ahorro':
      case 'pareja':
      case 'deuda':
      default:
        return {
          name: (row['name'] as string) ?? '',
          presupuestado: (row['presupuestado'] as number) ?? 0,
          real: (row['real'] as number) ?? 0
        };
    }
  }

  async saveEditFromForm(): Promise<void> {
    await this.saveEdit(this.editFormValues());
  }

  async saveEdit(values: Record<string, unknown>): Promise<void> {
    const dialogState = this.editDialog();
    const monthId = this.resolvedMonthId();
    const user = this.authService.currentUser;
    if (!dialogState || !monthId || !user) return;

    const rowId = dialogState.row['id'] as string;
    if (!rowId) return;

    const changes = this.normalizeEditValues(dialogState.type, values);

    this.editSaving.set(true);
    try {
      switch (dialogState.type) {
        case 'ingreso':
          await this.ingresosService.update(rowId, monthId, changes as Partial<Ingreso>);
          break;
        case 'factura':
          await this.facturasService.update(rowId, monthId, changes as Partial<Factura>);
          break;
        case 'gasto':
          await this.sectionService.gastos.update(rowId, changes, monthId);
          break;
        case 'ahorro':
          await this.sectionService.ahorros.update(rowId, changes, monthId);
          break;
        case 'pareja':
          await this.sectionService.pareja.update(rowId, changes, monthId);
          break;
        case 'deuda':
          await this.sectionService.deudas.update(rowId, changes, monthId);
          break;
      }
      await this.loadMonthData(user.uid, this.selectedYear(), this.selectedMonthIndex() + 1);
      this.closeEditDialog();
    } catch (error) {
      console.error('Error actualizando movimiento:', error);
    } finally {
      this.editSaving.set(false);
    }
  }

  private normalizeEditValues(type: EditDialogType, values: Record<string, unknown>): Record<string, unknown> {
    const numberOrZero = (value: unknown): number => {
      if (value === '' || value === null || value === undefined) return 0;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const stringOrNull = (value: unknown): string | null => {
      if (value === '' || value === null || value === undefined) return null;
      return String(value);
    };

    switch (type) {
      case 'ingreso':
        return {
          fuente: String(values['fuente'] ?? ''),
          dia_de_paga: stringOrNull(values['dia_de_paga']),
          esperado: numberOrZero(values['esperado']),
          real: numberOrZero(values['real']),
          depositado: Boolean(values['depositado'])
        };
      case 'factura':
        return {
          name: String(values['name'] ?? ''),
          fecha: stringOrNull(values['fecha']),
          presupuestado: numberOrZero(values['presupuestado']),
          real: numberOrZero(values['real']),
          is_recurring: Boolean(values['is_recurring'])
        };
      case 'gasto':
        return {
          name: String(values['name'] ?? ''),
          presupuestado: numberOrZero(values['presupuestado']),
          real: numberOrZero(values['real']),
          tipo: (values['tipo'] as 'fijos' | 'variables') ?? 'variables'
        };
      case 'ahorro':
      case 'pareja':
      case 'deuda':
      default:
        return {
          name: String(values['name'] ?? ''),
          presupuestado: numberOrZero(values['presupuestado']),
          real: numberOrZero(values['real'])
        };
    }
  }

  goToInvestments(): void {
    this.router.navigate(['/inversiones']);
  }

  goToInversionesOro(): void {
    this.router.navigate(['/desktop/inversiones/oro']);
  }

  goToSettings(): void {
    this.router.navigate(['/settings']);
  }
}
