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
  callout: {
    innerX: number;
    innerY: number;
    outerX: number;
    outerY: number;
    labelLineEndX: number;
    labelTextX: number;
    labelTextY: number;
    anchor: string;
  } | null;
}

const DONUT_RADIUS = 45;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const DONUT_CX = 70;
const DONUT_CY = 70;

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

  readonly donutCX = DONUT_CX;
  readonly donutCY = DONUT_CY;
  readonly donutR = DONUT_RADIUS;

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

    let cumulativeAngle = -Math.PI / 2;

    return items.map((section) => {
      const ratio = section.real / total;
      const segmentAngle = ratio * 2 * Math.PI;
      const segmentLength = ratio * DONUT_CIRCUMFERENCE;
      const midAngle = cumulativeAngle + segmentAngle / 2;
      cumulativeAngle += segmentAngle;

      const percentage = Math.round(ratio * 100);
      const showCallout = percentage >= 8;

      let callout: DonutSegment['callout'] = null;
      if (showCallout) {
        const innerRadius = DONUT_RADIUS + 6;
        const outerRadius = DONUT_RADIUS + 18;
        const tickLength = 10;
        const innerX = DONUT_CX + innerRadius * Math.cos(midAngle);
        const innerY = DONUT_CY + innerRadius * Math.sin(midAngle);
        const outerX = DONUT_CX + outerRadius * Math.cos(midAngle);
        const outerY = DONUT_CY + outerRadius * Math.sin(midAngle);
        const goRight = Math.cos(midAngle) >= 0;
        const labelLineEndX = outerX + (goRight ? tickLength : -tickLength);
        const labelTextX = labelLineEndX + (goRight ? 2 : -2);
        const labelTextY = outerY + 0.5;
        callout = {
          innerX,
          innerY,
          outerX,
          outerY,
          labelLineEndX,
          labelTextX,
          labelTextY,
          anchor: goRight ? 'start' : 'end',
        };
      }

      return {
        label: section.nombre,
        value: section.real,
        color: section.color,
        strokeDasharray: `${segmentLength.toFixed(2)} ${DONUT_CIRCUMFERENCE.toFixed(2)}`,
        strokeDashoffset: -(cumulativeAngle - segmentAngle - (-Math.PI / 2)) / (2 * Math.PI) * DONUT_CIRCUMFERENCE,
        percentage,
        callout,
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
