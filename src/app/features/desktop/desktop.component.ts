import { Component, signal, computed, inject, OnDestroy, ElementRef, DestroyRef, ChangeDetectorRef, afterNextRender } from '@angular/core';
import { CurrencyPipe, DecimalPipe, Location } from '@angular/common';
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
import { InversionesService } from '../../shared/services/inversiones.service';
import { DeudasInformalesService, DeudaInformal } from '../../shared/services/deudas-informales.service';
import { DashboardLayoutService } from '../../shared/services/dashboard-layout.service';
import {
  Ingreso,
  Factura,
  Gasto,
  Ahorro,
  Pareja,
  FondoAhorro,
  FondoAhorroMonthly,
  InversionOro,
  DashboardBlockKey,
  DashboardCategoryKey
} from '../../shared/models';
import { MONTH_NAMES } from '../../shared/constants/months';
import { MasonryGridDirective } from '../../shared/directives/masonry-grid.directive';
import { BottomNavComponent } from '../../layout/bottom-nav/bottom-nav.component';

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
  /** Línea secundaria bajo el valor (solo se muestra en móvil). */
  caption?: string;
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

/** Una fila del dashboard: o un bloque a ancho completo, o hasta 3 compactos. */
interface DashboardRow {
  id: string;
  compact: boolean;
  blocks: DashboardBlockKey[];
}

/** Bloques que comparten fila cuando quedan contiguos tras reordenar/ocultar. */
const COMPACT_BLOCKS = new Set<DashboardBlockKey>(['distribucion', 'resumen', 'objetivo']);
const COMPACT_ROW_SIZE = 3;

const DONUT_RADIUS = 45;
const DONUT_CX = 93;
const DONUT_CY = 93;
const DONUT_STROKE = 30;
/** Móvil: anillo más grande y trazo más fino para que el importe quepa en el hueco. */
const DONUT_RADIUS_MOBILE = 66;
const DONUT_STROKE_MOBILE = 15;

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

type EditDialogType = 'ingreso' | 'factura' | 'gasto' | 'ahorro' | 'pareja';

interface EditDialogState {
  type: EditDialogType;
  row: Record<string, unknown>;
}

const EDIT_TYPE_TO_CATEGORY: Record<Exclude<EditDialogType, 'ingreso'>, string> = {
  factura: 'facturas',
  gasto: 'gastos',
  ahorro: 'ahorros',
  pareja: 'pareja'
};

const MOBILE_MEDIA_QUERY = '(max-width: 1023px)';
const KPI_CARD_GAP = 10;

const EUR_FORMAT = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
});

@Component({
  selector: 'app-desktop',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, FormsModule, Dialog, Select, MasonryGridDirective, BottomNavComponent],
  templateUrl: './desktop.component.html',
  styleUrl: './desktop.component.scss',
  host: {
    '[class.sheet-open]': 'mobileSheetOpen()',
    '(document:keydown.escape)': 'onEscape()'
  }
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
  private readonly inversionesService = inject(InversionesService);
  private readonly deudasInformalesService = inject(DeudasInformalesService);
  private readonly dashboardLayoutService = inject(DashboardLayoutService);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly donutCX = DONUT_CX;
  readonly donutCY = DONUT_CY;
  readonly donutR = computed(() => this.isMobile() ? DONUT_RADIUS_MOBILE : DONUT_RADIUS);
  readonly donutStrokeWidth = computed(() => this.isMobile() ? DONUT_STROKE_MOBILE : DONUT_STROKE);

  readonly ringCX = RING_CX;
  readonly ringCY = RING_CY;
  readonly ringR = RING_RADIUS;
  readonly ringCircumference = RING_CIRCUMFERENCE;

  private readonly today = new Date();
  private readonly baseYear = this.today.getFullYear();
  private readonly baseMonthIndex = this.today.getMonth();

  readonly selectedYear = signal(this.readInitialYear());
  readonly selectedMonthIndex = signal(this.readInitialMonthIndex());

  private readonly monthDataPresence = signal<Record<number, boolean>>({});
  private subs: Subscription[] = [];
  private inversionesSubscription: Subscription | null = null;
  private deudasSubscription: Subscription | null = null;

  private readonly ingresosData = signal<Ingreso[]>([]);
  private readonly facturasData = signal<Factura[]>([]);
  private readonly gastosData = signal<Gasto[]>([]);
  private readonly ahorrosData = signal<Ahorro[]>([]);
  private readonly parejaData = signal<Pareja[]>([]);
  private readonly deudasData = signal<DeudaInformal[]>([]);
  private readonly fondosActive = signal<FondoAhorro[]>([]);
  private readonly fondosMonthly = signal<FondoAhorroMonthly[]>([]);
  private readonly inversionesAll = signal<InversionOro[]>([]);
  private readonly resolvedMonthId = signal<string | null>(null);
  readonly monthExists = signal<boolean>(false);
  readonly monthLoading = signal<boolean>(false);
  readonly isCopying = signal<boolean>(false);
  readonly copyMessage = signal<{ text: string; type: 'success' | 'error' } | null>(null);

  readonly currentMonthName = computed(() => MONTH_NAMES[this.selectedMonthIndex()]);

  /** Layout configurable desde Configuración › Editar grid. */
  readonly dashboardLayout = this.dashboardLayoutService.layout;

  readonly visibleCategoryKeys = computed<DashboardCategoryKey[]>(() =>
    this.dashboardLayout().categories.filter(entry => entry.visible).map(entry => entry.key)
  );

  /**
   * Agrupa los bloques visibles en filas: los compactos contiguos comparten
   * fila (hasta 3), el resto ocupa el ancho completo. Así ocultar o reordenar
   * nunca deja media fila vacía.
   */
  readonly dashboardRows = computed<DashboardRow[]>(() => {
    const rows: DashboardRow[] = [];
    for (const entry of this.dashboardLayout().blocks) {
      if (!entry.visible) continue;
      const compact = COMPACT_BLOCKS.has(entry.key);
      const last = rows[rows.length - 1];
      if (compact && last?.compact && last.blocks.length < COMPACT_ROW_SIZE) {
        last.blocks.push(entry.key);
      } else {
        rows.push({ id: entry.key, compact, blocks: [entry.key] });
      }
    }
    return rows;
  });

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

  // Only count valid deuda records (presupuestado > 0)
  readonly totalDeudasReal = computed(() =>
    this.deudasData().filter(i => i.presupuestado > 0).reduce((sum, item) => sum + (item.real || 0), 0)
  );

  readonly totalDeudasPresupuestado = computed(() =>
    this.deudasData().filter(i => i.presupuestado > 0).reduce((sum, item) => sum + (item.presupuestado || 0), 0)
  );

  readonly deudasCards = computed(() =>
    this.deudasData()
      .filter(item => item.presupuestado > 0)
      .map(item => {
        const pct = item.presupuestado > 0
          ? Math.min(100, (item.real / item.presupuestado) * 100)
          : 0;
        return {
          ...item,
          total: item.presupuestado,
          pct,
          done: pct >= 100
        };
      })
  );

  readonly deudaDialogVisible = signal(false);
  readonly deudaDialogItem = signal<DeudaInformal | null>(null);
  readonly deudaPaymentAmount = signal<number | null>(null);
  readonly deudaSaving = signal(false);

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
    this.totalFondosReal()
    // Deuda payments are already included as gastos entries in the month
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

  /** Próximo ingreso pendiente con día de paga: días que faltan y de dónde viene. */
  private readonly proximoCobro = computed<{ dias: number; fuente: string; fechaLabel: string } | null>(() => {
    const pending = this.ingresosData().filter(item => !item.depositado && item.dia_de_paga);
    if (!pending.length) return null;
    const referenceYear = this.selectedYear();
    const referenceMonth = this.selectedMonthIndex();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Pick the entry with the highest expected amount (the main salary)
    const main = [...pending].sort((a, b) => (b.esperado ?? 0) - (a.esperado ?? 0))[0];

    const raw = main.dia_de_paga ?? '';
    let payDate: Date;
    if (raw.includes('-')) {
      payDate = new Date(raw + 'T00:00:00');
    } else {
      const day = Number(raw);
      if (Number.isNaN(day) || day <= 0) return null;
      payDate = new Date(referenceYear, referenceMonth, day);
    }
    if (isNaN(payDate.getTime())) return null;
    const diff = Math.ceil((payDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return null;
    return { dias: diff, fuente: main.fuente, fechaLabel: `día ${payDate.getDate()}` };
  });

  readonly diasParaCobrar = computed(() => this.proximoCobro()?.dias ?? null);

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

  /** Presupuesto total del mes (todas las categorías de gasto). */
  readonly presupuestoTotal = computed(() =>
    this.totalFacturasPresupuestado() +
    this.totalGastosSectionPresupuestado() +
    this.totalAhorrosPresupuestado() +
    this.totalParejaPresupuestado() +
    this.totalFondosPresupuestado()
  );

  /**
   * Carrusel móvil: "Queda por gastar" va primero y en acento; cada tarjeta
   * lleva una línea de contexto porque en móvil no se ven todas a la vez.
   */
  readonly mobileKpiCards = computed<KpiCard[]>(() => {
    const presupuesto = this.presupuestoTotal();
    const esperado = this.totalIngresosEsperado();
    const gastos = this.totalGastos();
    const cobro = this.proximoCobro();
    const pct = presupuesto > 0 ? Math.round((gastos / presupuesto) * 100) : 0;
    return [
      {
        label: 'Queda por gastar',
        value: this.quedaPorGastar(),
        variant: 'accent',
        isCurrency: true,
        caption: `de ${EUR_FORMAT.format(presupuesto)} presupuestados`
      },
      {
        label: 'Gastos totales',
        value: gastos,
        variant: 'default',
        isCurrency: true,
        caption: `${pct} % del presupuesto`
      },
      {
        label: 'Ingresos totales',
        value: this.totalIngresos(),
        variant: 'default',
        isCurrency: true,
        caption: `de ${EUR_FORMAT.format(esperado)} esperados`
      },
      {
        label: 'Queda para presupuestar',
        value: this.quedaParaPresupuestar(),
        variant: 'default',
        isCurrency: true,
        caption: `sobre ${EUR_FORMAT.format(esperado)} de ingresos`
      },
      {
        label: 'Días para cobrar',
        value: cobro?.dias ?? 0,
        variant: 'default',
        isCurrency: false,
        suffix: cobro === null ? '—' : cobro.dias === 1 ? 'día' : 'días',
        caption: cobro ? `${cobro.fuente} el ${cobro.fechaLabel}` : 'Sin cobros pendientes'
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

    const circumference = 2 * Math.PI * this.donutR();
    let cumulativeAngle = 0;
    return items.map(item => {
      const ratio = item.value / total;
      const segmentLength = ratio * circumference;
      const offset = -cumulativeAngle * circumference;
      cumulativeAngle += ratio;
      return {
        label: item.label,
        value: item.value,
        color: item.color,
        strokeDasharray: `${segmentLength.toFixed(2)} ${circumference.toFixed(2)}`,
        strokeDashoffset: offset,
        percentage: Math.round(ratio * 100)
      };
    });
  });

  readonly ahorroObjetivo = computed(() => {
    // Target = 20% of expected income
    const objetivo = Math.round(this.totalIngresosEsperado() * 0.20);
    const real = this.totalAhorrosReal() + this.totalFondosReal();
    const percentage = objetivo > 0 ? Math.min(100, Math.round((real / objetivo) * 100)) : 0;
    const dashOffset = RING_CIRCUMFERENCE - (percentage / 100) * RING_CIRCUMFERENCE;
    return { presupuestado: objetivo, real, percentage, dashOffset };
  });

  readonly resumenPresupuesto = computed(() => {
    const rows = [
      { fuente: 'Facturas', presupuestado: this.totalFacturasPresupuestado(), real: this.totalFacturasReal() },
      { fuente: 'Gastos', presupuestado: this.totalGastosSectionPresupuestado(), real: this.totalGastosSectionReal() },
      { fuente: 'Ahorros', presupuestado: this.totalAhorrosPresupuestado(), real: this.totalAhorrosReal() },
      { fuente: 'Pareja', presupuestado: this.totalParejaPresupuestado(), real: this.totalParejaReal() },
      { fuente: 'Fondos', presupuestado: this.totalFondosPresupuestado(), real: this.totalFondosReal() }
    ].filter(row => row.presupuestado > 0 || row.real > 0);
    const totalPresupuestado = rows.reduce((sum, row) => sum + row.presupuestado, 0);
    const totalReal = rows.reduce((sum, row) => sum + row.real, 0);
    return { rows, totalPresupuestado, totalReal };
  });

  private readonly allCategoryTables = computed<CategoryTable[]>(() => [
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

  readonly categoryTables = computed<CategoryTable[]>(() => {
    const byKey = new Map(this.allCategoryTables().map(table => [table.key, table]));
    return this.visibleCategoryKeys()
      .map(key => byKey.get(key))
      .filter((table): table is CategoryTable => !!table);
  });

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
  /** «Eliminar» pulsado una vez: el pie del diálogo pasa a pedir confirmación. */
  readonly editDeleteArmed = signal(false);
  /** Texto con el que se nombra la fila en la confirmación de borrado. */
  readonly editRowLabel = computed(() => {
    const dialog = this.editDialog();
    if (!dialog) return '';
    const label = dialog.type === 'ingreso' ? dialog.row['fuente'] : dialog.row['name'];
    return typeof label === 'string' && label.trim() ? label.trim() : 'este movimiento';
  });

  // ---- Móvil (< 1024px): mismo componente y datos, disposición distinta ----

  /** Se sigue con matchMedia, no con el ancho de ventana en cada render. */
  readonly isMobile = signal(false);
  readonly mobileSearchOpen = signal(false);
  readonly objetivoExpanded = signal(false);
  readonly deudasExpanded = signal(false);
  /** Página visible del carrusel de KPIs (indicador de puntos). */
  readonly kpiPage = signal(0);
  /**
   * Categorías plegadas/desplegadas por el usuario. Si una clave no está,
   * aplica el valor por defecto: la primera abierta, el resto plegadas.
   */
  readonly expandedCategories = signal<Record<string, boolean>>({});
  /** Texto tal cual lo escribe el usuario en la hoja ("42,50"); se parsea a newMovementAmount. */
  readonly mobileAmountRaw = signal('');

  readonly mobileSheetOpen = computed(() => this.isMobile() && this.addMovementDialogVisible());

  readonly deudasPendientes = computed(() => this.deudasCards().filter(card => !card.done).length);

  readonly totalGramosMes = computed(() =>
    this.inversionesMes().reduce((sum, inv) => sum + (inv.gramos || 0), 0)
  );

  readonly selectedDestinationLabel = computed(() => {
    const destination = this.newMovementDestination();
    return this.destinationOptions.find(option => option.value === destination)?.label ?? null;
  });

  constructor() {
    const user = this.authService.currentUser;
    if (user) {
      this.loadMonthData(user.uid, this.selectedYear(), this.selectedMonthIndex() + 1);
      this.loadYearPresence(user.uid, this.selectedYear());
      // Vuelve a leerlo en cada entrada: puede haberse editado en Configuración.
      this.dashboardLayoutService.load(user.uid, true).catch(error =>
        console.error('Error cargando el layout del dashboard:', error)
      );
    }
    this.inversionesSubscription = this.inversionesService
      .getAll()
      .subscribe(items => this.inversionesAll.set(items));
    this.deudasSubscription = this.deudasInformalesService
      .getAll()
      .subscribe(items => this.deudasData.set(items));

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const media = window.matchMedia(MOBILE_MEDIA_QUERY);
      this.isMobile.set(media.matches);
      const onChange = (event: MediaQueryListEvent) => this.isMobile.set(event.matches);
      media.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() => media.removeEventListener('change', onChange));
    }

    // Al entrar, el chip del mes activo debe quedar a la vista.
    afterNextRender(() => this.scrollActiveChipIntoView('auto'));

    // /desktop?add=1: el «+» de la tab bar en otra pantalla pide abrir la hoja al llegar.
    if (this.route.snapshot.queryParams['add'] !== undefined) {
      afterNextRender(() => {
        // Limpia el parámetro (replace, sin entrada en el historial) para que
        // recargar o volver atrás no reabra la hoja.
        this.updateUrlParams();
        this.openAddMovementDialog();
      });
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(subscription => subscription.unsubscribe());
    this.inversionesSubscription?.unsubscribe();
    this.deudasSubscription?.unsubscribe();
  }

  private readInitialYear(): number {
    const params = this.route.snapshot.queryParams;
    if (params['year'] !== undefined) {
      const parsed = Number(params['year']);
      if (Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100) return parsed;
    }
    return this.baseYear;
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
    if (this.isMobile()) {
      setTimeout(() => this.scrollActiveChipIntoView('smooth'));
    }
  }

  private scrollActiveChipIntoView(behavior: ScrollBehavior): void {
    const chip = this.hostRef.nativeElement.querySelector<HTMLElement>('.month-chip.active');
    if (!chip) return;
    const reduce = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    chip.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : behavior });
  }

  toggleMobileSearch(): void {
    const next = !this.mobileSearchOpen();
    this.mobileSearchOpen.set(next);
    if (next) {
      this.cdr.detectChanges();
      this.hostRef.nativeElement.querySelector<HTMLInputElement>('.search-field input')?.focus();
    } else {
      this.searchTerm.set('');
    }
  }

  onKpiScroll(event: Event): void {
    const track = event.currentTarget as HTMLElement;
    const first = track.firstElementChild as HTMLElement | null;
    if (!first) return;
    const step = first.offsetWidth + KPI_CARD_GAP;
    this.kpiPage.set(Math.max(0, Math.round(track.scrollLeft / step)));
  }

  isCategoryExpanded(key: string, index: number): boolean {
    return this.expandedCategories()[key] ?? index === 0;
  }

  toggleCategory(key: string, index: number): void {
    const next = !this.isCategoryExpanded(key, index);
    this.expandedCategories.update(current => ({ ...current, [key]: next }));
  }

  /** La hoja usa un campo de texto con teclado decimal: acepta coma o punto. */
  setMobileAmount(raw: string): void {
    this.mobileAmountRaw.set(raw);
    const normalized = raw.replace(/\s/g, '').replace(',', '.');
    const parsed = Number(normalized);
    this.newMovementAmount.set(normalized !== '' && Number.isFinite(parsed) ? parsed : null);
  }

  /** "2026-09-30" o "30" → "30"; null si no hay día de paga. */
  diaPagaLabel(raw: string | null | undefined): string | null {
    if (!raw) return null;
    if (raw.includes('-')) {
      const day = Number(raw.split('-')[2]);
      return Number.isFinite(day) && day > 0 ? String(day) : null;
    }
    return raw;
  }

  onEscape(): void {
    if (this.mobileSheetOpen()) this.closeAddMovementDialog();
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
        this.sectionService.pareja.getAll(monthId).subscribe(items => this.parejaData.set(items as unknown as Pareja[]))
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
    // fondosActive is a global list of fund definitions, not month data — using
    // it here made every month look populated and hid the empty state.
    this.fondosMonthly().length > 0
  );

  readonly inversionesMes = computed(() => {
    const year = this.selectedYear();
    const monthIndex = this.selectedMonthIndex();
    return this.inversionesAll().filter(inv => {
      const fecha = this.parseFechaInversion(inv.fechaCompra, inv.created_at);
      return fecha.getFullYear() === year && fecha.getMonth() === monthIndex;
    });
  });

  readonly totalInvertidoMes = computed(() =>
    this.inversionesMes().reduce((sum, inv) => sum + (inv.precio_compra || 0), 0)
  );

  private parseFechaInversion(fechaCompra: Date | undefined, createdAt: string): Date {
    if (fechaCompra) {
      if (fechaCompra instanceof Date) return fechaCompra;
      const anyDate = fechaCompra as unknown as { seconds?: number; toDate?: () => Date };
      if (typeof anyDate.toDate === 'function') return anyDate.toDate();
      if (typeof anyDate.seconds === 'number') return new Date(anyDate.seconds * 1000);
      const parsed = new Date(fechaCompra as unknown as string);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date(createdAt);
  }

  formatoBadgeMini(formato: string): string {
    switch (formato) {
      case 'Lingote': return 'formato-mini--lingote';
      case 'Moneda': return 'formato-mini--moneda';
      case 'Joyería': return 'formato-mini--joyeria';
      default: return 'formato-mini--lingote';
    }
  }

  openAddMovementDialog(): void {
    // En móvil la sección viene preseleccionada: el botón "Guardar en Gastos" necesita un destino.
    this.newMovementDestination.set(this.isMobile() ? 'gastos' : null);
    this.newMovementDescription.set('');
    this.newMovementAmount.set(null);
    this.mobileAmountRaw.set('');
    this.newMovementMode.set('real');
    this.newMovementFondoId.set(null);
    this.addMovementDialogVisible.set(true);
    if (this.isMobile()) {
      // Foco síncrono dentro del gesto del usuario: así iOS sí muestra el teclado.
      this.cdr.detectChanges();
      this.hostRef.nativeElement.querySelector<HTMLInputElement>('#sheet-amount')?.focus({ preventScroll: true });
    }
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
    const presupuestoVal = isPlan ? amount : 0;

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

      if (!isPlan && (destination === 'gastos' || destination === 'ahorros' || destination === 'pareja')) {
        await this.deudasInformalesService.add({
          user_id: user.uid,
          name: description,
          presupuestado: amount,
          real: 0,
          created_at: new Date().toISOString()
        });
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
        this.copyFacturasFromPrevious(previousMonth.id, currentMonth.id, user.uid),
        this.copySectionFromPrevious('gastos', previousMonth.id, currentMonth.id, user.uid),
        this.copySectionFromPrevious('ahorros', previousMonth.id, currentMonth.id, user.uid),
        this.copySectionFromPrevious('pareja', previousMonth.id, currentMonth.id, user.uid)
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

  private async copyFacturasFromPrevious(
    previousMonthId: string,
    currentMonthId: string,
    userId: string
  ): Promise<void> {
    const previousRows = await this.facturasService.getByMonth(previousMonthId);
    const currentRows = await this.facturasService.getByMonth(currentMonthId);
    const currentNames = new Set(currentRows.map(r => r.name));
    for (const row of previousRows) {
      if (currentNames.has(row.name)) continue;
      const { id: _id, ...copy } = row;
      await this.facturasService.add({
        ...copy,
        month_id: currentMonthId,
        user_id: userId,
        real: 0,
      });
    }
  }

  private async copySectionFromPrevious(
    section: 'gastos' | 'ahorros' | 'pareja',
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
    this.editDeleteArmed.set(false);
    this.editDialog.set({ type, row: normalized });
    this.editFormValues.set(this.buildInitialEditValues(type, normalized));
  }

  closeEditDialog(): void {
    this.editDialog.set(null);
    this.editFormValues.set({});
    this.editDeleteArmed.set(false);
  }

  /** Primer paso de «Eliminar»: solo arma la confirmación, no borra. */
  armDelete(): void {
    if (this.editSaving()) return;
    this.editDeleteArmed.set(true);
  }

  disarmDelete(): void {
    this.editDeleteArmed.set(false);
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
      }
      await this.loadMonthData(user.uid, this.selectedYear(), this.selectedMonthIndex() + 1);
      this.closeEditDialog();
    } catch (error) {
      console.error('Error actualizando movimiento:', error);
    } finally {
      this.editSaving.set(false);
    }
  }

  /** Segundo paso de «Eliminar»: borra la fila que se está editando (en móvil no hay papelera en las filas). */
  async deleteFromEditDialog(): Promise<void> {
    const dialogState = this.editDialog();
    if (!dialogState || !this.editDeleteArmed()) return;
    const rowId = dialogState.row['id'] as string;
    if (!rowId) return;
    this.editSaving.set(true);
    try {
      if (dialogState.type === 'ingreso') {
        await this.deleteIngreso(rowId);
      } else {
        await this.deleteCategoryRow(EDIT_TYPE_TO_CATEGORY[dialogState.type], rowId);
      }
      this.closeEditDialog();
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
      default:
        return {
          name: String(values['name'] ?? ''),
          presupuestado: numberOrZero(values['presupuestado']),
          real: numberOrZero(values['real'])
        };
    }
  }

  openDeudaDialog(item: DeudaInformal): void {
    this.deudaDialogItem.set(item);
    this.deudaPaymentAmount.set(null);
    this.deudaDialogVisible.set(true);
  }

  async deleteDeuda(id: string): Promise<void> {
    try {
      await this.deudasInformalesService.remove(id);
    } catch (error) {
      console.error('Error eliminando deuda:', error);
    }
  }

  async submitDeudaPayment(): Promise<void> {
    const item = this.deudaDialogItem();
    const amount = this.deudaPaymentAmount();
    const monthId = this.resolvedMonthId();
    const user = this.authService.currentUser;
    if (!item || !amount || amount <= 0 || !monthId || !user) return;

    this.deudaSaving.set(true);
    try {
      // Update debt progress
      const newReal = Math.min((item.real || 0) + amount, item.presupuestado);
      await this.deudasInformalesService.update(item.id, { real: newReal });

      // Also record as a gasto in the current month so balance reflects correctly
      await this.sectionService.gastos.add({
        month_id: monthId,
        user_id: user.uid,
        name: `Pago deuda: ${item.name}`,
        presupuestado: 0,
        real: amount,
        tipo: 'variables',
        order_index: this.gastosData().length
      });

      this.deudaDialogVisible.set(false);
    } catch (error) {
      console.error('Error registrando pago de deuda:', error);
    } finally {
      this.deudaSaving.set(false);
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
