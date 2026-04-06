import { Component, OnInit, signal, computed, effect, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { MonthService } from '../../../shared/services/month.service';
import { IngresosService } from '../../../shared/services/ingresos.service';
import { FacturasService } from '../../../shared/services/facturas.service';
import { SectionService } from '../../../shared/services/section.service';
import { FondosAhorroService } from '../../../shared/services/fondos-ahorro.service';
import { DeudasService } from '../../../shared/services/deudas.service';
import { UserProfileService } from '../../../core/auth/user-profile.service';
import { Month, Ingreso, Factura, Gasto, Ahorro, Pareja, UserProfile } from '../../../shared/models';
import { BudgetTableComponent, BudgetRow } from '../../../shared/components/budget-table/budget-table.component';
import { IngresosTableComponent } from '../sections/ingresos/ingresos-table.component';
import { FacturasTableComponent } from '../sections/facturas/facturas-table.component';
import { GastosTableComponent } from '../sections/gastos/gastos-table.component';
import { FondosAhorroComponent } from '../sections/fondos-ahorro/fondos-ahorro.component';
import { DeudasComponent } from '../sections/deudas/deudas.component';
import { ResumenComponent } from '../sections/resumen/resumen.component';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

@Component({
  selector: 'app-month-view',
  standalone: true,
  imports: [
    CurrencyPipe,
    ToastModule,
    BudgetTableComponent,
    IngresosTableComponent,
    FacturasTableComponent,
    GastosTableComponent,
    FondosAhorroComponent,
    DeudasComponent,
    ResumenComponent
  ],
  providers: [MessageService],
  template: `
    <p-toast position="top-center" [life]="6000" />
    @if (loading()) {
      <div class="loading-state">
        <i class="pi pi-spin pi-spinner" style="font-size:2rem;color:var(--kakebo-indigo)"></i>
      </div>
    } @else {
      <div class="month-view">

        <!-- Page title -->
        <div class="month-header">
          <h1 class="month-title">{{ monthName() }} {{ year() }}</h1>
        </div>

        <!-- Hero strip -->
        <div class="hero-strip">
          <div class="hero-card">
            <span class="hero-label">Ingresos</span>
            <span class="hero-value positive">{{ totalIngresosReal() | currency:'EUR':'symbol':'1.2-2':'es' }}</span>
          </div>
          <div class="hero-card">
            <span class="hero-label">Gastos totales</span>
            <span class="hero-value negative">{{ totalGastosReal() | currency:'EUR':'symbol':'1.2-2':'es' }}</span>
          </div>
          <div class="hero-card highlight">
            <span class="hero-label">Queda por gastar</span>
            <span class="hero-value" [class.positive]="quedaPorGastar() >= 0" [class.negative]="quedaPorGastar() < 0">
              {{ quedaPorGastar() | currency:'EUR':'symbol':'1.2-2':'es' }}
            </span>
          </div>
          <div class="hero-card">
            <span class="hero-label">Por presupuestar</span>
            <span class="hero-value" [class.positive]="quedaParaPresupuestar() >= 0" [class.negative]="quedaParaPresupuestar() < 0">
              {{ quedaParaPresupuestar() | currency:'EUR':'symbol':'1.2-2':'es' }}
            </span>
          </div>
          @if (diaHastaCobro() !== null) {
            <div class="hero-card cobro">
              <span class="hero-label">Días hasta cobro</span>
              <span class="hero-value" [class.positive]="diaHastaCobro()! <= 5">{{ diaHastaCobro() }}</span>
            </div>
          }
        </div>

        @if (monthRecord()) {
          <div class="sections-grid">
            <!-- Resumen (full width) -->
            <div class="col-full">
              <app-resumen
            [ingresosTotals]="{ presupuestado: totalIngresosEsperado(), real: totalIngresosReal() }"
            [facturasTotals]="{ presupuestado: totalFacturasP(), real: totalFacturasR() }"
            [gastosTotals]="{ presupuestado: totalGastosP(), real: totalGastosR() }"
            [ahorrosTotals]="{ presupuestado: totalAhorrosP(), real: totalAhorrosR() }"
            [fondosTotals]="{ presupuestado: totalFondosP(), real: totalFondosR() }"
            [parejaTotals]="hasPartner() ? { presupuestado: totalParejaP(), real: totalParejaR() } : null"
            [deudasTotals]="{ presupuestado: totalDeudasP(), real: totalDeudasR() }" />
            </div>

            <!-- Ingresos -->
            <app-ingresos-table
              [items]="ingresos()"
              [monthId]="monthRecord()!.id"
              [userId]="userId()"
              [year]="year()"
              [month]="monthNum()"
              (changed)="loadIngresos()" />

            <!-- Facturas -->
            <app-facturas-table
              [items]="facturas()"
              [monthId]="monthRecord()!.id"
              [userId]="userId()"
              (changed)="loadFacturas()" />

            <!-- Gastos -->
            <app-gastos-table
              [items]="gastos()"
              [monthId]="monthRecord()!.id"
              [userId]="userId()"
              (changed)="loadGastos()" />

            <!-- Ahorros -->
            <app-budget-table
              title="Ahorros"
              tooltip="Colchón de emergencia, inversiones, fondos de pensiones..."
              [items]="ahorroRows()"
              (itemAdded)="addAhorro($event)"
              (itemUpdated)="updateAhorro($event)"
              (itemDeleted)="deleteAhorro($event)" />

            <!-- Fondos de Ahorro -->
            <app-fondos-ahorro
              [monthId]="monthRecord()!.id"
              [userId]="userId()"
              (totalsChanged)="onFondosTotalsChanged($event)" />

            <!-- Pareja (condicional) -->
            @if (hasPartner()) {
              <app-budget-table
                title="Pareja"
                tooltip="Gastos compartidos con tu pareja. Pon solo tu parte (ej: perro, gastos de casa...)."
                [items]="parejaRows()"
                (itemAdded)="addPareja($event)"
                (itemUpdated)="updatePareja($event)"
                (itemDeleted)="deletePareja($event)" />
            }

            <!-- Deudas -->
            <app-deudas
              [monthId]="monthRecord()!.id"
              [userId]="userId()"
              (totalsChanged)="onDeudasTotalsChanged($event)" />
          </div>
        }

      </div>
    }
  `,
  styles: [`
    .loading-state {
      display: flex; align-items: center; justify-content: center; min-height: 60vh;
    }
    .month-view { display: flex; flex-direction: column; gap: 0; }
    .month-header { margin-bottom: 0.75rem; }
    .month-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--kakebo-indigo);
    }

    @media (max-width: 767px) {
      .month-header { margin-bottom: 0.5rem; }
      .month-title { font-size: 1.25rem; }
    }

    /* ── Sections Grid ──────────────────────────── */
    .sections-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .col-full { grid-column: 1 / -1; }

    @media (min-width: 768px) {
      .sections-grid {
        grid-template-columns: 1fr 1fr;
      }
      .col-full { grid-column: 1 / -1; }
    }

    .hero-strip {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
      margin-bottom: 1.25rem;
    }

    @media (min-width: 768px) {
      .hero-strip {
        display: flex;
        gap: 0.75rem;
        padding-bottom: 0.25rem;
      }
    }

    .hero-card {
      background: #fff;
      border: 1px solid var(--kakebo-borde);
      border-radius: 12px;
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;

      &.highlight {
        background: var(--kakebo-indigo);
        border-color: var(--kakebo-indigo);
        .hero-label { color: rgba(255,255,255,0.7); }
        .hero-value { color: #fff; }
      }
    }

    @media (max-width: 767px) {
      .hero-card {
        padding: 0.625rem 0.75rem;
        border-radius: 8px;
        min-width: 0;
      }
    }

    .hero-label {
      font-size: 0.7rem;
      color: var(--kakebo-texto-secundario);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }

    .hero-value {
      font-size: 1rem;
      font-weight: 700;
      color: var(--kakebo-texto-principal);
      &.positive { color: var(--kakebo-verde); }
      &.negative { color: var(--kakebo-rojo-soft); }
    }
  `]
})
export class MonthViewComponent implements OnInit {
  loading = signal(true);
  monthRecord = signal<Month | null>(null);
  ingresos = signal<Ingreso[]>([]);
  facturas = signal<Factura[]>([]);
  gastos = signal<Gasto[]>([]);
  ahorros = signal<Ahorro[]>([]);
  pareja = signal<Pareja[]>([]);
  profile = signal<UserProfile | null>(null);

  fondosPresupuestado = signal(0);
  fondosReal = signal(0);
  deudasPresupuestado = signal(0);
  deudasReal = signal(0);

  year = signal(0);
  monthNum = signal(0);

  monthName = computed(() => MONTH_NAMES[this.monthNum() - 1] ?? '');
  userId = computed(() => this.auth.currentUser?.id ?? '');
  hasPartner = computed(() => this.profile()?.has_partner ?? false);

  // Computed totals
  totalIngresosEsperado = computed(() => this.ingresos().reduce((s, i) => s + i.esperado, 0));
  totalIngresosReal = computed(() => this.ingresos().reduce((s, i) => s + i.real, 0));
  totalFacturasP = computed(() => this.facturas().reduce((s, f) => s + f.presupuestado, 0));
  totalFacturasR = computed(() => this.facturas().reduce((s, f) => s + f.real, 0));
  totalGastosP = computed(() => this.gastos().reduce((s, g) => s + g.presupuestado, 0));
  totalGastosR = computed(() => this.gastos().reduce((s, g) => s + g.real, 0));
  totalAhorrosP = computed(() => this.ahorros().reduce((s, a) => s + a.presupuestado, 0));
  totalAhorrosR = computed(() => this.ahorros().reduce((s, a) => s + a.real, 0));
  totalParejaP = computed(() => this.pareja().reduce((s, p) => s + p.presupuestado, 0));
  totalParejaR = computed(() => this.pareja().reduce((s, p) => s + p.real, 0));
  totalFondosP = computed(() => this.fondosPresupuestado());
  totalFondosR = computed(() => this.fondosReal());
  totalDeudasP = computed(() => this.deudasPresupuestado());
  totalDeudasR = computed(() => this.deudasReal());

  totalGastosReal = computed(() =>
    this.totalFacturasR() + this.totalGastosR() + this.totalAhorrosR() +
    this.totalFondosR() + this.totalParejaR() + this.totalDeudasR()
  );

  quedaPorGastar = computed(() => this.totalIngresosReal() - this.totalGastosReal());

  quedaParaPresupuestar = computed(() =>
    this.totalIngresosEsperado() -
    (this.totalFacturasP() + this.totalGastosP() + this.totalAhorrosP() +
     this.totalFondosP() + this.totalParejaP() + this.totalDeudasP())
  );

  diaHastaCobro = computed(() => {
    const ing = this.ingresos().find(i => i.dia_de_paga);
    if (!ing?.dia_de_paga) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pay = new Date(ing.dia_de_paga);
    pay.setHours(0, 0, 0, 0);
    const diff = Math.round((pay.getTime() - today.getTime()) / 86400000);
    return diff;
  });

  ahorroRows = computed(() => this.ahorros().map(a => ({
    ...a, name: a.name, presupuestado: a.presupuestado, real: a.real
  })));

  parejaRows = computed(() => this.pareja().map(p => ({
    ...p, name: p.name, presupuestado: p.presupuestado, real: p.real
  })));

  constructor(
    private route: ActivatedRoute,
    private auth: AuthService,
    private supabase: SupabaseService,
    private monthService: MonthService,
    private ingresosService: IngresosService,
    private facturasService: FacturasService,
    private sectionService: SectionService,
    private fondosService: FondosAhorroService,
    private deudasService: DeudasService,
    private profileService: UserProfileService,
    private messageService: MessageService
  ) {
    effect(() => {
      const restante = this.quedaParaPresupuestar();
      if (restante < 0 && !this.loading()) {
        this.messageService.add({
          severity: 'warn',
          summary: '⚠️ Presupuesto excedido',
          detail: `Tus gastos presupuestados superan tus ingresos esperados en ${Math.abs(restante).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}.`,
          life: 6000
        });
      }
    });

    effect(() => {
      const restante = this.quedaPorGastar();
      if (restante < 0 && !this.loading()) {
        this.messageService.add({
          severity: 'error',
          summary: '🚨 Gastos por encima de ingresos',
          detail: `Has gastado ${Math.abs(restante).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })} más de lo que has ingresado este mes.`,
          life: 6000
        });
      }
    });
  }

  async ngOnInit() {
    this.route.params.subscribe(async params => {
      this.loading.set(true);
      this.year.set(+params['year']);
      this.monthNum.set(+params['month']);
      await this.loadAll();
      this.loading.set(false);
    });
  }

  private async loadAll() {
    // Get session directly to avoid race condition with signal initialization
    const { data } = await this.supabase.client.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;

    const [monthRec, profileData] = await Promise.all([
      this.monthService.getOrCreateMonth(uid, this.year(), this.monthNum()),
      this.profileService.getProfile(uid)
    ]);

    this.monthRecord.set(monthRec);
    this.profile.set(profileData);

    await Promise.all([
      this.loadIngresos(),
      this.loadFacturas(),
      this.loadGastos(),
      this.loadAhorros(),
      this.loadPareja()
    ]);
  }

  async loadIngresos() {
    const mid = this.monthRecord()?.id;
    if (!mid) return;
    this.ingresos.set(await this.ingresosService.getByMonth(mid));
  }

  async loadFacturas() {
    const mid = this.monthRecord()?.id;
    if (!mid) return;
    this.facturas.set(await this.facturasService.getByMonth(mid));
  }

  async loadGastos() {
    const mid = this.monthRecord()?.id;
    if (!mid) return;
    this.gastos.set(await this.sectionService.gastos.getByMonth(mid) as Gasto[]);
  }

  async loadAhorros() {
    const mid = this.monthRecord()?.id;
    if (!mid) return;
    this.ahorros.set(await this.sectionService.ahorros.getByMonth(mid) as Ahorro[]);
  }

  async loadPareja() {
    const mid = this.monthRecord()?.id;
    if (!mid) return;
    this.pareja.set(await this.sectionService.pareja.getByMonth(mid) as Pareja[]);
  }

  async addAhorro(e: { name: string; presupuestado: number }) {
    const mid = this.monthRecord()?.id;
    if (!mid) return;
    await this.sectionService.ahorros.add({ month_id: mid, user_id: this.userId(), name: e.name, presupuestado: e.presupuestado, real: 0, order_index: this.ahorros().length });
    await this.loadAhorros();
  }

  async updateAhorro(e: { id: string; name: string; presupuestado: number; real: number }) {
    await this.sectionService.ahorros.update(e.id, { name: e.name, presupuestado: e.presupuestado, real: e.real });
    await this.loadAhorros();
  }

  async deleteAhorro(id: string) {
    await this.sectionService.ahorros.remove(id);
    await this.loadAhorros();
  }

  async addPareja(e: { name: string; presupuestado: number }) {
    const mid = this.monthRecord()?.id;
    if (!mid) return;
    await this.sectionService.pareja.add({ month_id: mid, user_id: this.userId(), name: e.name, presupuestado: e.presupuestado, real: 0, order_index: this.pareja().length });
    await this.loadPareja();
  }

  async updatePareja(e: { id: string; name: string; presupuestado: number; real: number }) {
    await this.sectionService.pareja.update(e.id, { name: e.name, presupuestado: e.presupuestado, real: e.real });
    await this.loadPareja();
  }

  async deletePareja(id: string) {
    await this.sectionService.pareja.remove(id);
    await this.loadPareja();
  }

  onFondosTotalsChanged(totals: { presupuestado: number; real: number }) {
    this.fondosPresupuestado.set(totals.presupuestado);
    this.fondosReal.set(totals.real);
  }

  onDeudasTotalsChanged(totals: { presupuestado: number; real: number }) {
    this.deudasPresupuestado.set(totals.presupuestado);
    this.deudasReal.set(totals.real);
  }
}
