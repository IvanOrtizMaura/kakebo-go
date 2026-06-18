import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';
import { AuthService } from '../../../core/auth/auth.service';
import { Gasto } from '../../../shared/models';
import { MonthService } from '../../../shared/services/month.service';
import { AportacionPension, PensionesService } from '../../../shared/services/pensiones.service';
import { SectionService } from '../../../shared/services/section.service';

interface ProjectionRow {
  year: number;
  primaPeriodica: number;
  primasAcumuladas: number;
  desfavorable: number;
  moderado: number;
  favorable: number;
}

interface ChartData {
  primasPath: string;
  moderadoPath: string;
  favorablePath: string;
  xAxis: Array<{ x: number; label: string }>;
  yAxis: Array<{ y: number; label: string }>;
  currentYearX: number;
}

interface GastoCreation extends Record<string, unknown> {
  month_id: string;
  user_id: string;
  name: string;
  nombre: string;
  presupuestado: number;
  importe: number;
  real: number;
  tipo: Gasto['tipo'];
  categoria: string;
  order_index: number;
  pagado: boolean;
}

const OVB_PROJECTION: ProjectionRow[] = [
  { year: 1, primaPeriodica: 1080, primasAcumuladas: 1080, desfavorable: 797, moderado: 1019, favorable: 1200 },
  { year: 2, primaPeriodica: 1112, primasAcumuladas: 2192, desfavorable: 1773, moderado: 2146, favorable: 2501 },
  { year: 3, primaPeriodica: 1146, primasAcumuladas: 3338, desfavorable: 2891, moderado: 3444, favorable: 4152 },
  { year: 4, primaPeriodica: 1180, primasAcumuladas: 4518, desfavorable: 4374, moderado: 4960, favorable: 5916 },
  { year: 5, primaPeriodica: 1216, primasAcumuladas: 5734, desfavorable: 5471, moderado: 6716, favorable: 7981 },
  { year: 6, primaPeriodica: 1252, primasAcumuladas: 6986, desfavorable: 6723, moderado: 8777, favorable: 10222 },
  { year: 7, primaPeriodica: 1290, primasAcumuladas: 8275, desfavorable: 8013, moderado: 11053, favorable: 12876 },
  { year: 8, primaPeriodica: 1328, primasAcumuladas: 9604, desfavorable: 9341, moderado: 13652, favorable: 16013 },
  { year: 9, primaPeriodica: 1368, primasAcumuladas: 10972, desfavorable: 10709, moderado: 16413, favorable: 19655 },
  { year: 10, primaPeriodica: 1409, primasAcumuladas: 12381, desfavorable: 12118, moderado: 19693, favorable: 23888 },
  { year: 11, primaPeriodica: 1451, primasAcumuladas: 13832, desfavorable: 13570, moderado: 23662, favorable: 28037 },
  { year: 12, primaPeriodica: 1495, primasAcumuladas: 15327, desfavorable: 14867, moderado: 27787, favorable: 34580 },
  { year: 13, primaPeriodica: 1540, primasAcumuladas: 16867, desfavorable: 16191, moderado: 32403, favorable: 42317 },
  { year: 14, primaPeriodica: 1586, primasAcumuladas: 18453, desfavorable: 17542, moderado: 37564, favorable: 51460 },
  { year: 15, primaPeriodica: 1634, primasAcumuladas: 20087, desfavorable: 18922, moderado: 43330, favorable: 62256 },
  { year: 16, primaPeriodica: 1683, primasAcumuladas: 21769, desfavorable: 20332, moderado: 49768, favorable: 74995 },
  { year: 17, primaPeriodica: 1733, primasAcumuladas: 23502, desfavorable: 21772, moderado: 56952, favorable: 90021 },
  { year: 18, primaPeriodica: 1785, primasAcumuladas: 25288, desfavorable: 23244, moderado: 64963, favorable: 107735 },
  { year: 19, primaPeriodica: 1839, primasAcumuladas: 27126, desfavorable: 24750, moderado: 73893, favorable: 128609 },
  { year: 20, primaPeriodica: 1894, primasAcumuladas: 29020, desfavorable: 26289, moderado: 83840, favorable: 153198 },
  { year: 21, primaPeriodica: 1951, primasAcumuladas: 30971, desfavorable: 27863, moderado: 94918, favorable: 182155 },
  { year: 22, primaPeriodica: 2009, primasAcumuladas: 32980, desfavorable: 29474, moderado: 107248, favorable: 216247 }
];

const PLAN_START_DATE = new Date(2026, 1, 1);

function calculateCurrentPlanYear(): number {
  const now = new Date();
  const monthsElapsed =
    (now.getFullYear() - PLAN_START_DATE.getFullYear()) * 12 +
    (now.getMonth() - PLAN_START_DATE.getMonth());

  return Math.min(Math.max(Math.floor(monthsElapsed / 12) + 1, 1), 22);
}

@Component({
  selector: 'app-pensiones',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FormsModule,
    RouterModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    CalendarModule,
    BottomNavComponent
  ],
  templateUrl: './pensiones.component.html',
  styleUrl: './pensiones.component.scss'
})
export class PensionesComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly pensionesService = inject(PensionesService);
  private readonly monthService = inject(MonthService);
  private readonly sectionService = inject(SectionService);
  private subscription?: Subscription;

  readonly aportaciones = signal<AportacionPension[]>([]);
  readonly isLoading = signal(true);
  readonly showAllAportaciones = signal(false);
  readonly dialogVisible = signal(false);
  readonly newFecha = signal<Date>(new Date());
  readonly newImporte = signal<number | null>(null);
  readonly newNota = signal<string>('');
  readonly currentPlanYear = calculateCurrentPlanYear();

  readonly currentProjection = computed(() => OVB_PROJECTION[this.currentPlanYear - 1]);
  readonly totalAportado = computed(() => this.aportaciones().reduce((sum, a) => sum + a.importe, 0));
  readonly diferencia = computed(() => this.totalAportado() - this.currentProjection().primasAcumuladas);
  readonly planProgress = computed(() => (this.currentPlanYear / 22) * 100);
  readonly recentAportaciones = computed(() =>
    [...this.aportaciones()].sort((a, b) => b.fecha.getTime() - a.fecha.getTime()).slice(0, 5)
  );
  readonly displayedAportaciones = computed(() =>
    this.showAllAportaciones()
      ? [...this.aportaciones()].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
      : this.recentAportaciones()
  );
  readonly chartData = computed<ChartData>(() => {
    const width = 900;
    const height = 300;
    const padding = { top: 20, right: 20, bottom: 40, left: 70 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxValue = 216247;
    const xForYear = (year: number) => padding.left + ((year - 1) / 21) * chartWidth;
    const yForValue = (value: number) => padding.top + chartHeight - (value / maxValue) * chartHeight;
    const toPoints = (selector: (entry: ProjectionRow) => number) =>
      OVB_PROJECTION.map(entry => `${xForYear(entry.year)},${yForValue(selector(entry))}`).join(' ');
    const yTickValues = [0, maxValue * 0.25, maxValue * 0.5, maxValue * 0.75, maxValue].map(value => Math.round(value));

    return {
      primasPath: toPoints(entry => entry.primasAcumuladas),
      moderadoPath: toPoints(entry => entry.moderado),
      favorablePath: toPoints(entry => entry.favorable),
      xAxis: [1, 5, 10, 15, 20, 22].map(year => ({ x: xForYear(year), label: String(year) })),
      yAxis: yTickValues.map(value => ({
        y: yForValue(value),
        label: `€${Math.round(value / 1000)}k`
      })),
      currentYearX: xForYear(this.currentPlanYear)
    };
  });

  ngOnInit(): void {
    this.loadAportaciones();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  loadAportaciones(): void {
    this.subscription?.unsubscribe();
    this.subscription = this.pensionesService.getAll().subscribe({
      next: aportaciones => {
        this.aportaciones.set(aportaciones);
        this.isLoading.set(false);
      },
      error: () => {
        this.aportaciones.set([]);
        this.isLoading.set(false);
      }
    });
  }

  openDialog(): void {
    this.newFecha.set(new Date());
    this.newImporte.set(null);
    this.newNota.set('');
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  async saveAportacion(): Promise<void> {
    const user = this.authService.currentUser;
    const importe = this.newImporte();
    const fecha = this.newFecha();

    if (!user || importe === null || importe <= 0) {
      return;
    }

    await this.pensionesService.add({
      fecha,
      importe,
      nota: this.newNota().trim() || undefined
    });
    await this.createPaidExpense(user.uid, fecha, 'Pensión OVB', importe);

    this.loadAportaciones();
    this.closeDialog();
  }

  async deleteAportacion(id: string): Promise<void> {
    await this.pensionesService.delete(id);
    this.loadAportaciones();
  }

  navigateBack(): void {
    this.router.navigate(['/inversiones']);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
  }

  private async createPaidExpense(userId: string, expenseDate: Date, name: string, amount: number): Promise<void> {
    const month = await this.monthService.getOrCreateMonth(
      userId,
      expenseDate.getFullYear(),
      expenseDate.getMonth() + 1
    );
    const existingExpenses = await this.sectionService.gastos.getByMonth(month.id);
    const gasto: GastoCreation = {
      month_id: month.id,
      user_id: userId,
      name,
      nombre: name,
      presupuestado: amount,
      importe: amount,
      real: amount,
      tipo: 'variables',
      categoria: 'Inversiones',
      order_index: existingExpenses.length,
      pagado: true
    };

    await this.sectionService.gastos.add(gasto);
  }
}
