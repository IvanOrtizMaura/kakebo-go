import { Component, signal, computed, inject, OnDestroy } from '@angular/core';
import { CurrencyPipe, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog } from 'primeng/dialog';
import { Select } from 'primeng/select';
import { Subscription } from 'rxjs';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';
import { AuthService } from '../../../core/auth/auth.service';
import { MonthService } from '../../../shared/services/month.service';
import { IngresosService } from '../../../shared/services/ingresos.service';
import { FacturasService } from '../../../shared/services/facturas.service';
import { SectionService } from '../../../shared/services/section.service';
import { Ingreso, Factura, Gasto, Ahorro, DeudaSection } from '../../../shared/models';
import { MONTH_NAMES } from '../../../shared/constants/months';

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
  percentage: number;
  callout: { x1: number; y1: number; x2: number; y2: number; x3: number; tx: number; ty: number; anchor: string } | null;
}

const DONUT_RADIUS = 45;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, Select, BottomNavComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly authService = inject(AuthService);
  private readonly monthService = inject(MonthService);
  private readonly ingresosService = inject(IngresosService);
  private readonly facturasService = inject(FacturasService);
  private readonly sectionService = inject(SectionService);

  private readonly baseYear = new Date().getFullYear();
  private readonly baseMonthIndex = new Date().getMonth();
  readonly monthOffset = signal(this.calculateInitialOffset());
  private subs: Subscription[] = [];

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

  private readonly ingresosData = signal<Ingreso[]>([]);
  private readonly facturasData = signal<Factura[]>([]);
  private readonly gastosData = signal<Gasto[]>([]);
  private readonly ahorrosData = signal<Ahorro[]>([]);
  private readonly deudasData = signal<DeudaSection[]>([]);
  private readonly resolvedMonthId = signal<string | null>(null);

  readonly ingresos = computed(() =>
    this.ingresosData().reduce((sum, item) => sum + item.real, 0)
  );

  readonly gastos = computed(() =>
    this.facturasData().reduce((sum, item) => sum + item.real, 0) +
    this.gastosData().reduce((sum, item) => sum + item.real, 0) +
    this.deudasData().reduce((sum, item) => sum + item.real, 0)
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
      presupuestado: this.deudasData().reduce((sum, d) => sum + d.presupuestado, 0),
      real: this.deudasData().reduce((sum, d) => sum + d.real, 0)
    }
  ]);

  readonly donutSegments = computed((): DonutSegment[] => {
    const items = this.secciones().filter(s => s.nombre !== 'Ingresos');
    const total = items.reduce((sum, section) => sum + section.real, 0);

    if (total === 0) return [];

    const CX = 70, CY = 70, R = 45, CIRCUMFERENCE = 2 * Math.PI * R;
    let cumulativeAngle = -Math.PI / 2; // start at top

    return items.map((section) => {
      const ratio = section.real / total;
      const segmentAngle = ratio * 2 * Math.PI;
      const segmentLength = ratio * CIRCUMFERENCE;
      const midAngle = cumulativeAngle + segmentAngle / 2;
      cumulativeAngle += segmentAngle;

      const percentage = Math.round(ratio * 100);
      const showCallout = percentage >= 5;

      let callout = null;
      if (showCallout) {
        const innerR = R + 2;
        const outerR = R + 13;
        const tickLen = 8;
        const x1 = CX + innerR * Math.cos(midAngle);
        const y1 = CY + innerR * Math.sin(midAngle);
        const x2 = CX + outerR * Math.cos(midAngle);
        const y2 = CY + outerR * Math.sin(midAngle);
        const goRight = Math.cos(midAngle) >= 0;
        const x3 = x2 + (goRight ? tickLen : -tickLen);
        const tx = x3 + (goRight ? 1.5 : -1.5);
        const ty = y2 + 0.5;
        callout = { x1, y1, x2, y2, x3, tx, ty, anchor: goRight ? 'start' : 'end' };
      }

      return {
        label: section.nombre,
        value: section.real,
        color: section.color,
        strokeDasharray: `${segmentLength.toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`,
        strokeDashoffset: -(cumulativeAngle - segmentAngle - (-Math.PI / 2)) / (2 * Math.PI) * CIRCUMFERENCE,
        percentage,
        callout
      };
    });
  });

  readonly totalGastos = computed(() =>
    this.secciones().filter(s => s.nombre !== 'Ingresos').reduce((sum, section) => sum + section.real, 0)
  );

  readonly nuevoGastoDialogVisible = signal(false);
  readonly nuevoGastoNombre = signal('');
  readonly nuevoGastoCategoria = signal<string>('');
  readonly nuevoGastoImporte = signal<number | null>(null);
  readonly categorias = ['Ingresos', 'Facturas', 'Gastos', 'Ahorros', 'Deudas'];

  constructor() {
    const user = this.authService.currentUser;
    if (user) {
      this.loadMonthData(user.uid, this.currentYear(), this.currentMonthIndex() + 1);
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  private loadMonthData(userId: string, year: number, month: number): void {
    // Cancela subscripciones previas de datos del mes
    this.subs.forEach(s => s.unsubscribe());
    this.subs = [];

    // Limpia datos mientras carga
    this.ingresosData.set([]);
    this.facturasData.set([]);
    this.gastosData.set([]);
    this.ahorrosData.set([]);
    this.deudasData.set([]);

    this.monthService.getOrCreateMonth(userId, year, month).then(resolvedMonth => {
      const monthId = resolvedMonth.id;
      this.resolvedMonthId.set(monthId);
      this.subs.push(
        this.ingresosService.getAll(monthId).subscribe(items => this.ingresosData.set(items)),
        this.facturasService.getAll(monthId).subscribe(items => this.facturasData.set(items)),
        this.sectionService.gastos.getAll(monthId).subscribe(items => this.gastosData.set(items as unknown as Gasto[])),
        this.sectionService.ahorros.getAll(monthId).subscribe(items => this.ahorrosData.set(items as unknown as Ahorro[])),
        this.sectionService.deudas.getAll(monthId).subscribe(items => this.deudasData.set(items as unknown as DeudaSection[]))
      );
    }).catch(err => console.error('Error cargando mes:', err));
  }

  private get currentMonthId(): string | null {
    return this.resolvedMonthId();
  }

  navigateToPreviousMonth(): void {
    const user = this.authService.currentUser;
    if (!user) return;
    this.monthOffset.update(offset => offset - 1);
    this.updateUrlParams();
    this.loadMonthData(user.uid, this.currentYear(), this.currentMonthIndex() + 1);
  }

  navigateToNextMonth(): void {
    const user = this.authService.currentUser;
    if (!user) return;
    this.monthOffset.update(offset => offset + 1);
    this.updateUrlParams();
    this.loadMonthData(user.uid, this.currentYear(), this.currentMonthIndex() + 1);
  }

  goToToday(): void {
    const user = this.authService.currentUser;
    if (!user) return;
    this.monthOffset.set(0);
    this.updateUrlParams();
    this.loadMonthData(user.uid, this.currentYear(), this.currentMonthIndex() + 1);
  }

  private updateUrlParams(): void {
    const year = this.currentYear();
    const month = this.currentMonthIndex();
    this.location.replaceState('/home', `year=${year}&month=${month}`);
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

  sectionProgressPercentage(section: SectionBudget): number {
    if (section.presupuestado === 0) return 0;
    return Math.min((section.real / section.presupuestado) * 100, 100);
  }

  isSectionExceeded(section: SectionBudget): boolean {
    return section.real > section.presupuestado;
  }

  navigateToSection(nombre: string): void {
    const routeMap: Record<string, string> = {
      'Ingresos': '/ingresos',
      'Facturas': '/facturas',
      'Gastos': '/gastos',
      'Ahorros': '/ahorros',
      'Deudas': '/deudas'
    };
    const route = routeMap[nombre];
    if (route) {
      this.router.navigate([route], {
        queryParams: { year: this.currentYear(), month: this.currentMonthIndex() }
      });
    }
  }

  onAjustarPresupuestoClick(): void {
    this.router.navigate(['/planificacion'], {
      queryParams: { year: this.currentYear(), month: this.currentMonthIndex() }
    });
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
    const monthId = this.currentMonthId;
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
            esperado: 0,
            real: importe,
            dia_de_paga: null,
            depositado: true,
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
            presupuestado: 0,
            real: importe,
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
            presupuestado: 0,
            real: importe,
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
            presupuestado: 0,
            real: importe,
            order_index: this.ahorrosData().length
          });
          break;

        case 'Deudas':
          if (!monthId) return;
          await this.sectionService.deudas.add({
            month_id: monthId,
            user_id: user.uid,
            name: nombre,
            presupuestado: 0,
            real: importe,
            order_index: this.deudasData().length
          });
          break;
      }

      this.closeNuevoGastoDialog();
    } catch (error) {
      console.error('Error al guardar item:', error);
    }
  }
}
