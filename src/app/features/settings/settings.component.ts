import { Component, OnInit, signal, computed, inject, DestroyRef, ElementRef, HostListener, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TooltipModule } from 'primeng/tooltip';
import { Draggable, Droppable } from 'primeng/dragdrop';
import { Auth } from '@angular/fire/auth';
import {
  Firestore, DocumentReference, collection, getDocs, writeBatch, query, where
} from '@angular/fire/firestore';
import { DeudasService } from '../../shared/services/deudas.service';
import { FondosAhorroService } from '../../shared/services/fondos-ahorro.service';
import { DeudasInformalesService, DeudaInformal } from '../../shared/services/deudas-informales.service';
import { Deuda, FondoAhorro, DashboardBlockKey, DashboardCategoryKey, DashboardLayout } from '../../shared/models';
import {
  DashboardLayoutService,
  DASHBOARD_BLOCKS,
  DASHBOARD_CATEGORIES,
  defaultDashboardLayout
} from '../../shared/services/dashboard-layout.service';

export type SettingsView = 'hub' | 'fondos' | 'deudas' | 'grid' | 'herramientas';

export interface ConfigHubCard {
  view: SettingsView;
  initial: string;
  accentClass: string;
  title: string;
  description: string;
  pill: string | null;
  /** Shown but not openable yet — renders as a "Próximamente" card. */
  disabled?: boolean;
}

/** Fila arrastrable del editor de grid (sirve para bloques y categorías). */
export interface GridRow {
  key: string;
  label: string;
  description: string;
  visible: boolean;
  /** Solo en categorías: punto de color que las identifica en el dashboard. */
  color?: string;
  /** Solo en bloques: los compactos comparten fila si quedan contiguos. */
  compact?: boolean;
}

export type GridListName = 'blocks' | 'categories';

/** Fila de la vista previa del reset: cuántos registros y cuánto importe real pasan a 0 por sección. */
export interface ResetPreviewRow {
  key: string;
  label: string;
  count: number;
  total: number;
  note?: string;
}

/** Valores originales de un doc afectado por el reset, para poder deshacer. */
interface ResetSnapshotEntry {
  ref: DocumentReference;
  real: number;
  depositado?: boolean;
}

/** Resumen del último reset ejecutado; vive mientras el aviso de éxito esté visible. */
export interface ResetResult {
  label: string;
  count: number;
  amount: number;
}

const RESET_SECTIONS: { key: string; label: string; note?: string }[] = [
  { key: 'ingresos', label: 'Ingresos', note: 'Pasan a no depositados' },
  { key: 'facturas', label: 'Facturas' },
  { key: 'gastos', label: 'Gastos' },
  { key: 'ahorros', label: 'Ahorros' },
  { key: 'pareja', label: 'Pareja' },
  { key: 'deudas', label: 'Deudas' },
];

const DESKTOP_QUERY = '(min-width: 1024px)';

export interface FondosSummary {
  count: number;
  cuota: number;
  objetivo: number;
  ahorrado: number;
}

export interface FondoTableRow {
  id: string;
  name: string;
  monthlyAmount: number;
  totalAmount: number;
  savedAmount: number;
  progressPercentage: number;
  numMonths: number;
}

const DEFAULT_FONDO_MONTHS = 11;

const VIEW_TITLES: Record<SettingsView, string> = {
  hub: 'Configuración',
  fondos: 'Fondos de Ahorro',
  deudas: 'Deudas',
  grid: 'Editar grid',
  herramientas: 'Herramientas',
};

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DecimalPipe, InputTextModule, InputNumberModule, TooltipModule, Draggable, Droppable],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  activeView = signal<SettingsView>('hub');

  // ── Fondos de Ahorro ─────────────────────────────────────────
  fondos = signal<FondoAhorro[]>([]);
  fondosArchivados = signal<FondoAhorro[]>([]);
  showFondosArchivados = signal(false);
  editingFondoId = signal<string | null>(null);
  editFondoNombre = '';
  editFondoTotal = 0;
  editFondoMeses = DEFAULT_FONDO_MONTHS;
  newFondoNombre = '';
  newFondoTotal = 0;
  newFondoMeses = DEFAULT_FONDO_MONTHS;
  editingSavedId = signal<string | null>(null);
  editingSavedAmount = 0;

  fondosTableRows = computed<FondoTableRow[]>(() =>
    this.fondos().map(fondo => {
      const numMonths = fondo.num_months || DEFAULT_FONDO_MONTHS;
      const savedAmount = fondo.saved_amount ?? 0;
      const progressPercentage = fondo.total_amount > 0
        ? Math.min(100, Math.round((savedAmount / fondo.total_amount) * 100))
        : 0;
      return {
        id: fondo.id,
        name: fondo.name,
        monthlyAmount: fondo.monthly_amount,
        totalAmount: fondo.total_amount,
        savedAmount,
        progressPercentage,
        numMonths
      };
    })
  );

  fondosSummary = computed<FondosSummary>(() => {
    const rows = this.fondosTableRows();
    return {
      count: rows.length,
      cuota: rows.reduce((sum, row) => sum + row.monthlyAmount, 0),
      objetivo: rows.reduce((sum, row) => sum + row.totalAmount, 0),
      ahorrado: rows.reduce((sum, row) => sum + row.savedAmount, 0)
    };
  });

  // ── Deudas informales ────────────────────────────────────────
  deudasInformales = signal<DeudaInformal[]>([]);
  editingDeudaInformalId = signal<string | null>(null);
  editDeudaInformalReal = 0;

  // ── Deudas bancarias (préstamos) ─────────────────────────────
  deudas = signal<Deuda[]>([]);
  deudasArchivadas = signal<Deuda[]>([]);
  showDeudasArchivadas = signal(false);
  editingDeudaId = signal<string | null>(null);
  editDeudaNombre = '';
  editDeudaCuota = 0;
  editDeudaMeses: number | null = null;
  newDeudaNombre = '';
  newDeudaTipo: 'bank' | 'savings' = 'bank';
  newDeudaCapital = 0;
  newDeudaInteres = 0;
  newDeudaMeses = 0;
  newDeudaCuotaFinal = 0;
  newDeudaStartYear = new Date().getFullYear();
  newDeudaStartMonth = new Date().getMonth() + 1;

  configCards = computed<ConfigHubCard[]>(() => [
    {
      view: 'fondos',
      initial: 'F',
      accentClass: 'accent-orange',
      title: 'Fondos de Ahorro',
      description: 'Gastos futuros programados: vacaciones, navidades, seguros...',
      pill: this.fondos().length > 0 ? `${this.fondos().length}` : null
    },
    {
      view: 'deudas',
      initial: 'D',
      accentClass: 'accent-red',
      title: 'Deudas',
      description: 'Deudas informales y préstamos/hipotecas activas',
      pill: (this.deudasInformales().length + this.deudas().length) > 0
        ? `${this.deudasInformales().length + this.deudas().length}`
        : null
    },
    {
      view: 'grid',
      initial: 'G',
      accentClass: 'accent-blue',
      title: 'Editar grid',
      description: 'Reordena y elige qué tarjetas ves en el dashboard de cada mes',
      pill: this.gridHiddenCount() > 0 ? `${this.gridHiddenCount()} oculto${this.gridHiddenCount() === 1 ? '' : 's'}` : null
    },
    {
      view: 'herramientas',
      initial: '⚙',
      accentClass: 'accent-purple',
      title: 'Herramientas',
      description: 'Utilidades avanzadas: resetear mes para simulacros y pruebas',
      pill: null
    },
  ]);

  activeViewTitle = computed(() => VIEW_TITLES[this.activeView()]);

  /** Subtítulo de la topbar en desktop: para Herramientas un texto corto; el resto usa su descripción. */
  activeViewCaption = computed(() => {
    const view = this.activeView();
    if (view === 'herramientas') return 'Configuración · Utilidades avanzadas';
    const card = this.configCards().find(c => c.view === view);
    return card ? `Configuración · ${card.description}` : 'Configuración';
  });

  /** ≥1024px, mismo umbral que goBack(). Se actualiza al redimensionar. */
  isDesktop = signal(typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches);

  /** Sidebar tipo "source list" + topbar: solo en desktop y dentro de una sub-vista. */
  showSourceSidebar = computed(() => this.isDesktop() && this.activeView() !== 'hub');

  private userId = '';
  private fbAuth = inject(Auth);
  private router = inject(Router);
  private firestore = inject(Firestore);
  private destroyRef = inject(DestroyRef);

  constructor(
    private deudasService: DeudasService,
    private fondosAhorroService: FondosAhorroService,
    private deudasInformalesService: DeudasInformalesService,
    private dashboardLayoutService: DashboardLayoutService
  ) {
    if (typeof window !== 'undefined') {
      const media = window.matchMedia(DESKTOP_QUERY);
      const onChange = (e: MediaQueryListEvent) => this.isDesktop.set(e.matches);
      media.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() => media.removeEventListener('change', onChange));
    }
  }

  goBack() {
    this.router.navigate(['/desktop']);
  }

  async ngOnInit() {
    this.userId = this.fbAuth.currentUser?.uid ?? '';
    if (!this.userId) return;
    // allSettled y no all: un cargador que falle (p. ej. una query de Firestore
    // sin índice) no debe impedir que el resto de secciones se pinten.
    const results = await Promise.allSettled([
      this.loadFondos(),
      this.loadDeudas(),
      this.loadDeudasInformales(),
      this.loadGridLayout(),
    ]);
    results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .forEach(result => console.error('[settings] carga fallida:', result.reason));
  }

  openView(view: SettingsView) {
    if (view !== this.activeView()) this.dismissResetResult();
    this.activeView.set(view);
  }
  backToHub() {
    this.dismissResetResult();
    this.activeView.set('hub');
  }

  // ── Fondos de Ahorro ─────────────────────────────────────────

  get newFondoMonthly(): number {
    const meses = this.newFondoMeses || DEFAULT_FONDO_MONTHS;
    return this.newFondoTotal > 0 ? Math.ceil(this.newFondoTotal / meses) : 0;
  }

  get editFondoMonthly(): number {
    const meses = this.editFondoMeses || DEFAULT_FONDO_MONTHS;
    return this.editFondoTotal > 0 ? Math.ceil(this.editFondoTotal / meses) : 0;
  }

  private async loadFondos() {
    const [active, archived] = await Promise.all([
      this.fondosAhorroService.getActive(this.userId),
      this.fondosAhorroService.getArchived(this.userId)
    ]);
    this.fondos.set(active);
    this.fondosArchivados.set(archived);
  }

  async addFondo() {
    if (!this.newFondoNombre.trim() || this.newFondoTotal <= 0) return;
    if (!this.userId) this.userId = this.fbAuth.currentUser?.uid ?? '';
    if (!this.userId) return;
    const meses = this.newFondoMeses || DEFAULT_FONDO_MONTHS;
    try {
      await this.fondosAhorroService.create({
        user_id: this.userId,
        name: this.newFondoNombre.trim(),
        total_amount: this.newFondoTotal,
        monthly_amount: Math.ceil(this.newFondoTotal / meses),
        num_months: meses,
        start_year: new Date().getFullYear(),
        start_month: new Date().getMonth() + 1,
        is_active: true
      });
      this.resetNewFondoForm();
      await this.loadFondos();
    } catch (e) {
      console.error('[addFondo]', e);
    }
  }

  resetNewFondoForm() {
    this.newFondoNombre = '';
    this.newFondoTotal = 0;
    this.newFondoMeses = DEFAULT_FONDO_MONTHS;
  }

  startEditFondo(f: FondoAhorro) {
    this.editingFondoId.set(f.id);
    this.editFondoNombre = f.name;
    this.editFondoTotal = f.total_amount;
    this.editFondoMeses = f.num_months ?? DEFAULT_FONDO_MONTHS;
  }

  async saveFondo(id: string) {
    const meses = this.editFondoMeses || DEFAULT_FONDO_MONTHS;
    await this.fondosAhorroService.update(id, {
      name: this.editFondoNombre,
      total_amount: this.editFondoTotal,
      monthly_amount: Math.ceil(this.editFondoTotal / meses),
      num_months: meses
    });
    this.editingFondoId.set(null);
    await this.loadFondos();
  }

  cancelEditFondo() { this.editingFondoId.set(null); }

  async archiveFondo(id: string) {
    await this.fondosAhorroService.archive(id);
    await this.loadFondos();
  }

  async deleteFondo(id: string) {
    await this.fondosAhorroService.delete(id);
    await this.loadFondos();
  }

  toggleFondosArchivados() { this.showFondosArchivados.update(v => !v); }

  startEditSaved(row: FondoTableRow) {
    this.editingSavedId.set(row.id);
    this.editingSavedAmount = row.savedAmount;
  }

  cancelEditSaved() { this.editingSavedId.set(null); }

  async saveEditSaved(id: string) {
    await this.fondosAhorroService.updateSavedAmount(id, this.editingSavedAmount);
    this.editingSavedId.set(null);
    await this.loadFondos();
  }

  // ── Deudas informales ────────────────────────────────────────

  private async loadDeudasInformales() {
    const items = await firstValueFrom(this.deudasInformalesService.getAll());
    this.deudasInformales.set(items ?? []);
  }

  startEditDeudaInformal(d: DeudaInformal) {
    this.editingDeudaInformalId.set(d.id);
    this.editDeudaInformalReal = d.real;
  }

  cancelEditDeudaInformal() { this.editingDeudaInformalId.set(null); }

  async saveDeudaInformalReal(d: DeudaInformal) {
    await this.deudasInformalesService.update(d.id, { real: this.editDeudaInformalReal });
    this.editingDeudaInformalId.set(null);
    await this.loadDeudasInformales();
  }

  async deleteDeudaInformal(id: string) {
    await this.deudasInformalesService.remove(id);
    await this.loadDeudasInformales();
  }

  deudaInformalProgress(d: DeudaInformal): number {
    if (!d.presupuestado) return 0;
    return Math.min(100, Math.round((d.real / d.presupuestado) * 100));
  }

  // ── Deudas bancarias ─────────────────────────────────────────

  private async loadDeudas() {
    const [active, archived] = await Promise.all([
      this.deudasService.getActive(this.userId),
      this.deudasService.getArchived(this.userId)
    ]);
    this.deudas.set(active);
    this.deudasArchivadas.set(archived);
  }

  get newDeudaTotalConInteres(): number {
    if (this.newDeudaTipo === 'savings') return this.newDeudaCapital * 1.05;
    if (this.newDeudaMeses > 0) return this.newDeudaCuotaCalculada * this.newDeudaMeses;
    return this.newDeudaCapital;
  }

  get newDeudaCuotaCalculada(): number {
    if (this.newDeudaTipo === 'savings') {
      const total = this.newDeudaCapital * 1.05;
      return this.newDeudaMeses > 0 ? total / this.newDeudaMeses : 0;
    }
    if (this.newDeudaMeses > 0 && this.newDeudaCapital > 0) {
      const r = this.newDeudaInteres / 12 / 100;
      if (r === 0) return this.newDeudaCapital / this.newDeudaMeses;
      const factor = Math.pow(1 + r, this.newDeudaMeses);
      return this.newDeudaCapital * r * factor / (factor - 1);
    }
    return this.newDeudaCuotaFinal;
  }

  recalcCuota() {
    const calc = this.newDeudaCuotaCalculada;
    if (calc > 0) this.newDeudaCuotaFinal = Math.round(calc * 100) / 100;
  }

  deudaProgress(d: Deuda): number {
    if (!d.total_amount) return 0;
    return Math.min(100, ((d.total_amount - d.amount_remaining) / d.total_amount) * 100);
  }

  async addDeuda() {
    if (!this.newDeudaNombre.trim() || this.newDeudaCapital <= 0) return;
    const cuota = this.newDeudaCuotaFinal;
    const interestRate = this.newDeudaTipo === 'savings' ? 5 : this.newDeudaInteres;
    const total = this.newDeudaTipo === 'savings'
      ? this.newDeudaCapital * 1.05
      : (this.newDeudaMeses > 0 ? cuota * this.newDeudaMeses : this.newDeudaCapital);
    await this.deudasService.create({
      user_id: this.userId,
      name: this.newDeudaNombre.trim(),
      type: this.newDeudaTipo,
      principal_amount: this.newDeudaCapital,
      total_amount: total,
      interest_rate: interestRate,
      monthly_payment: cuota,
      amount_remaining: total,
      is_active: true,
      start_year: this.newDeudaStartYear || null,
      start_month: this.newDeudaStartMonth || null,
      num_months: this.newDeudaMeses > 0 ? this.newDeudaMeses : null
    });
    this.newDeudaNombre = '';
    this.newDeudaTipo = 'bank';
    this.newDeudaCapital = 0;
    this.newDeudaInteres = 0;
    this.newDeudaMeses = 0;
    this.newDeudaCuotaFinal = 0;
    this.newDeudaStartYear = new Date().getFullYear();
    this.newDeudaStartMonth = new Date().getMonth() + 1;
    await this.loadDeudas();
  }

  startEditDeuda(d: Deuda) {
    this.editingDeudaId.set(d.id);
    this.editDeudaNombre = d.name;
    this.editDeudaCuota = d.monthly_payment;
    this.editDeudaMeses = d.num_months ?? null;
  }

  async saveDeuda(id: string) {
    await this.deudasService.update(id, {
      name: this.editDeudaNombre,
      monthly_payment: this.editDeudaCuota,
      num_months: this.editDeudaMeses ?? null
    });
    this.editingDeudaId.set(null);
    await this.loadDeudas();
  }

  cancelEditDeuda() { this.editingDeudaId.set(null); }

  async archiveDeuda(id: string) {
    await this.deudasService.archive(id);
    await this.loadDeudas();
  }

  toggleDeudasArchivadas() { this.showDeudasArchivadas.update(v => !v); }

  // ── Editar grid del dashboard ────────────────────────────────

  gridBlocks = signal<GridRow[]>([]);
  gridCategories = signal<GridRow[]>([]);
  gridSaving = signal(false);
  gridMessage = signal<{ text: string; type: 'success' | 'error' } | null>(null);

  /** Snapshot serializado de lo último guardado, para detectar cambios. */
  private gridBaseline = signal('');

  private dragList = signal<GridListName | null>(null);
  private dragIndex = signal<number | null>(null);
  dragOverIndex = signal<number | null>(null);

  gridCurrentLayout = computed<DashboardLayout>(() => ({
    blocks: this.gridBlocks().map(row => ({ key: row.key as DashboardBlockKey, visible: row.visible })),
    categories: this.gridCategories().map(row => ({ key: row.key as DashboardCategoryKey, visible: row.visible }))
  }));

  gridDirty = computed(() => JSON.stringify(this.gridCurrentLayout()) !== this.gridBaseline());

  gridHiddenCount = computed(() =>
    this.gridBlocks().filter(row => !row.visible).length +
    this.gridCategories().filter(row => !row.visible).length
  );

  gridVisibleBlocks = computed(() => this.gridBlocks().filter(row => row.visible).length);
  gridVisibleCategories = computed(() => this.gridCategories().filter(row => row.visible).length);

  isDragTarget(list: GridListName, index: number): boolean {
    return this.dragList() === list && this.dragOverIndex() === index && this.dragIndex() !== index;
  }

  isDragSource(list: GridListName, index: number): boolean {
    return this.dragList() === list && this.dragIndex() === index;
  }

  private async loadGridLayout() {
    const layout = await this.dashboardLayoutService.load(this.userId, true);
    this.applyGridLayout(layout);
  }

  private applyGridLayout(layout: DashboardLayout) {
    this.gridBlocks.set(layout.blocks.map(entry => {
      const meta = DASHBOARD_BLOCKS.find(block => block.key === entry.key)!;
      return { key: entry.key, label: meta.label, description: meta.description, visible: entry.visible, compact: meta.compact };
    }));
    this.gridCategories.set(layout.categories.map(entry => {
      const meta = DASHBOARD_CATEGORIES.find(category => category.key === entry.key)!;
      return { key: entry.key, label: meta.label, description: 'Tarjeta dentro del bloque Categorías', visible: entry.visible, color: meta.color };
    }));
    this.gridBaseline.set(JSON.stringify(this.gridCurrentLayout()));
  }

  private gridSignal(list: GridListName) {
    return list === 'blocks' ? this.gridBlocks : this.gridCategories;
  }

  toggleGridRow(list: GridListName, index: number) {
    this.gridSignal(list).update(rows =>
      rows.map((row, i) => (i === index ? { ...row, visible: !row.visible } : row))
    );
    this.gridMessage.set(null);
  }

  onGridDragStart(list: GridListName, index: number) {
    this.dragList.set(list);
    this.dragIndex.set(index);
  }

  onGridDragEnter(list: GridListName, index: number) {
    if (this.dragList() !== list) return;
    this.dragOverIndex.set(index);
  }

  onGridDragEnd() {
    this.dragList.set(null);
    this.dragIndex.set(null);
    this.dragOverIndex.set(null);
  }

  onGridDrop(list: GridListName, targetIndex: number) {
    const from = this.dragIndex();
    if (this.dragList() !== list || from === null || from === targetIndex) {
      this.onGridDragEnd();
      return;
    }
    this.gridSignal(list).update(rows => {
      const next = [...rows];
      const [moved] = next.splice(from, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    this.gridMessage.set(null);
    this.onGridDragEnd();
  }

  /** Alternativa accesible al arrastre: mover una fila con el teclado. */
  moveGridRow(list: GridListName, index: number, delta: number) {
    const signalRef = this.gridSignal(list);
    const target = index + delta;
    if (target < 0 || target >= signalRef().length) return;
    signalRef.update(rows => {
      const next = [...rows];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
    this.gridMessage.set(null);
  }

  discardGridChanges() {
    const baseline = this.gridBaseline();
    if (!baseline) return;
    this.applyGridLayout(JSON.parse(baseline) as DashboardLayout);
    this.gridMessage.set(null);
  }

  resetGridLayout() {
    this.applyGridLayoutKeepingDirty(defaultDashboardLayout());
  }

  /** Restablecer deja los cambios pendientes de guardar, no los guarda solo. */
  private applyGridLayoutKeepingDirty(layout: DashboardLayout) {
    const baseline = this.gridBaseline();
    this.applyGridLayout(layout);
    this.gridBaseline.set(baseline);
    this.gridMessage.set(null);
  }

  async saveGridLayout() {
    if (!this.userId) this.userId = this.fbAuth.currentUser?.uid ?? '';
    if (!this.userId || this.gridSaving()) return;
    this.gridSaving.set(true);
    try {
      const layout = this.gridCurrentLayout();
      await this.dashboardLayoutService.save(this.userId, layout);
      this.gridBaseline.set(JSON.stringify(layout));
      this.gridMessage.set({ text: 'Grid guardado. Se aplicará en el dashboard de todos los meses.', type: 'success' });
    } catch (error) {
      console.error('[saveGridLayout]', error);
      this.gridMessage.set({ text: 'No se pudo guardar el grid. Inténtalo de nuevo.', type: 'error' });
    } finally {
      this.gridSaving.set(false);
    }
  }

  readonly meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // ── Herramientas: reset mes ──────────────────────────────────
  showResetConfirm = signal(false);
  loadingPreview = signal(false);
  resetting = signal(false);
  resetSuccess = signal(false);
  resetUndoing = signal(false);
  resetUndone = signal(false);
  resetError = signal<string | null>(null);
  resetYear = new Date().getFullYear();
  resetMonth = new Date().getMonth() + 1;

  /** Vista previa calculada al abrir el diálogo (solo lecturas). null = sin calcular. */
  resetPreview = signal<ResetPreviewRow[] | null>(null);
  resetPreviewTotalCount = computed(() => (this.resetPreview() ?? []).reduce((sum, row) => sum + row.count, 0));
  resetPreviewTotalAmount = computed(() => (this.resetPreview() ?? []).reduce((sum, row) => sum + row.total, 0));
  /** Filas con registros; si todas están a 0 la plantilla muestra el estado vacío. */
  resetPreviewVisibleRows = computed(() => (this.resetPreview() ?? []).filter(row => row.count > 0));

  /** Resumen del último reset, mostrado en el aviso de éxito con Deshacer. */
  resetResult = signal<ResetResult | null>(null);

  private resetSnapshot: ResetSnapshotEntry[] = [];
  private resetUndoneTimer: ReturnType<typeof setTimeout> | null = null;
  private resetCancelBtn = viewChild<ElementRef<HTMLButtonElement>>('resetCancelBtn');

  get resetMonthId(): string {
    return `${this.resetYear}-${String(this.resetMonth).padStart(2, '0')}`;
  }

  get resetMonthLabel(): string {
    return `${this.meses[Number(this.resetMonth) - 1]} ${this.resetYear}`;
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.showResetConfirm() && !this.resetting()) this.closeResetConfirm();
  }

  /** Lee las mismas colecciones que el reset, sin escribir, y guarda el snapshot para deshacer. */
  async openResetConfirm() {
    const uid = this.fbAuth.currentUser?.uid;
    if (!uid || this.loadingPreview() || this.resetting()) return;
    this.loadingPreview.set(true);
    this.resetError.set(null);
    try {
      const monthId = this.resetMonthId;
      const rows: ResetPreviewRow[] = [];
      const snapshot: ResetSnapshotEntry[] = [];

      for (const section of RESET_SECTIONS) {
        const col = collection(this.firestore, 'users', uid, 'months', monthId, section.key);
        const snap = await getDocs(col);
        let count = 0;
        let total = 0;
        snap.docs.forEach(d => {
          const data = d.data() as { real?: number; depositado?: boolean };
          const real = Number(data.real ?? 0) || 0;
          const depositado = section.key === 'ingresos' ? Boolean(data.depositado) : undefined;
          if (real !== 0) {
            count++;
            total += real;
          }
          // Guardamos también ingresos ya a 0 pero marcados como depositados: el reset los toca.
          if (real !== 0 || depositado) snapshot.push({ ref: d.ref, real, depositado });
        });
        rows.push({ key: section.key, label: section.label, count, total, note: section.note });
      }

      const fondosCol = collection(this.firestore, 'users', uid, 'fondos_ahorro_monthly');
      const fondosSnap = await getDocs(query(fondosCol, where('month_id', '==', monthId)));
      let fondosCount = 0;
      let fondosTotal = 0;
      fondosSnap.docs.forEach(d => {
        const real = Number((d.data() as { real?: number }).real ?? 0) || 0;
        if (real !== 0) {
          fondosCount++;
          fondosTotal += real;
          snapshot.push({ ref: d.ref, real });
        }
      });
      rows.push({ key: 'fondos_ahorro', label: 'Fondos de ahorro', count: fondosCount, total: fondosTotal });

      this.resetSnapshot = snapshot;
      this.resetPreview.set(rows);
      this.showResetConfirm.set(true);
      // Foco inicial en la acción segura, tras pintar el diálogo.
      setTimeout(() => this.resetCancelBtn()?.nativeElement.focus(), 0);
    } catch (e) {
      console.error('[resetPreview]', e);
      this.resetError.set('No se pudo calcular la vista previa. Inténtalo de nuevo.');
    } finally {
      this.loadingPreview.set(false);
    }
  }

  closeResetConfirm() {
    if (this.resetting()) return;
    this.showResetConfirm.set(false);
    this.resetPreview.set(null);
    this.resetSnapshot = [];
  }

  async executeResetMonth() {
    const uid = this.fbAuth.currentUser?.uid;
    if (!uid || this.resetting()) return;
    this.resetting.set(true);
    this.resetError.set(null);
    try {
      const monthId = this.resetMonthId;
      const label = this.resetMonthLabel;
      const count = this.resetPreviewTotalCount();
      const amount = this.resetPreviewTotalAmount();
      const batch = writeBatch(this.firestore);

      for (const section of RESET_SECTIONS) {
        const col = collection(this.firestore, 'users', uid, 'months', monthId, section.key);
        const snap = await getDocs(col);
        snap.docs.forEach(d => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const update: any = { real: 0 };
          if (section.key === 'ingresos') update.depositado = false;
          batch.update(d.ref, update);
        });
      }

      const fondosCol = collection(this.firestore, 'users', uid, 'fondos_ahorro_monthly');
      const fondosSnap = await getDocs(query(fondosCol, where('month_id', '==', monthId)));
      fondosSnap.docs.forEach(d => batch.update(d.ref, { real: 0 }));

      await batch.commit();
      this.showResetConfirm.set(false);
      this.resetPreview.set(null);
      this.clearResetUndoneTimer();
      this.resetUndone.set(false);
      this.resetResult.set({ label, count, amount });
      this.resetSuccess.set(true);
      // El snapshot se conserva mientras el aviso esté visible: es lo que permite deshacer.
    } catch (e) {
      console.error('[resetMonth]', e);
      this.resetError.set('No se pudo resetear el mes. Inténtalo de nuevo.');
    } finally {
      this.resetting.set(false);
    }
  }

  /** Restaura los valores originales guardados al abrir el diálogo. */
  async undoResetMonth() {
    if (this.resetUndoing() || this.resetSnapshot.length === 0) {
      this.dismissResetResult();
      return;
    }
    this.resetUndoing.set(true);
    this.resetError.set(null);
    try {
      const batch = writeBatch(this.firestore);
      for (const entry of this.resetSnapshot) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: any = { real: entry.real };
        if (entry.depositado !== undefined) update.depositado = entry.depositado;
        batch.update(entry.ref, update);
      }
      await batch.commit();
      this.dismissResetResult();
      this.resetUndone.set(true);
      this.clearResetUndoneTimer();
      this.resetUndoneTimer = setTimeout(() => this.resetUndone.set(false), 4000);
    } catch (e) {
      console.error('[undoResetMonth]', e);
      this.resetError.set('No se pudo deshacer el reset.');
    } finally {
      this.resetUndoing.set(false);
    }
  }

  /** Cierra el aviso de éxito y descarta el snapshot: a partir de aquí ya no se puede deshacer. */
  dismissResetResult() {
    this.resetSuccess.set(false);
    this.resetResult.set(null);
    this.resetSnapshot = [];
  }

  private clearResetUndoneTimer() {
    if (this.resetUndoneTimer) {
      clearTimeout(this.resetUndoneTimer);
      this.resetUndoneTimer = null;
    }
  }
}
