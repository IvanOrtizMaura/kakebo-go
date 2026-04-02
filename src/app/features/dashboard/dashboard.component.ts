import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';
import { MonthService } from '../../shared/services/month.service';
import { SupabaseService } from '../../core/supabase/supabase.service';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface MonthCard {
  monthNum: number;
  name: string;
  ingresos: number;
  gastos: number;
  ahorros: number;
  balance: number;
  hasData: boolean;
  isCurrent: boolean;
  isFuture: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CurrencyPipe],
  template: `
    <div class="dashboard">
      <div class="dash-header">
        <h1 class="dash-title">Resumen {{ year() }}</h1>
        <div class="year-nav">
          <button class="year-btn" (click)="changeYear(-1)"><i class="pi pi-chevron-left"></i></button>
          <span>{{ year() }}</span>
          <button class="year-btn" [disabled]="year() >= currentYear" (click)="changeYear(1)"><i class="pi pi-chevron-right"></i></button>
        </div>
      </div>

      <!-- Annual summary cards -->
      <div class="annual-summary">
        <div class="summary-card">
          <span class="s-label">Ingresos anuales</span>
          <span class="s-value positive">{{ totalIngresosYear() | currency:'EUR':'symbol':'1.0-0':'es' }}</span>
        </div>
        <div class="summary-card">
          <span class="s-label">Gastos anuales</span>
          <span class="s-value negative">{{ totalGastosYear() | currency:'EUR':'symbol':'1.0-0':'es' }}</span>
        </div>
        <div class="summary-card">
          <span class="s-label">Total ahorrado</span>
          <span class="s-value positive">{{ totalAhorrosYear() | currency:'EUR':'symbol':'1.0-0':'es' }}</span>
        </div>
        <div class="summary-card accent">
          <span class="s-label">Balance anual</span>
          <span class="s-value" [class.positive]="balanceYear() >= 0" [class.negative]="balanceYear() < 0">
            {{ balanceYear() | currency:'EUR':'symbol':'1.0-0':'es' }}
          </span>
        </div>
      </div>

      <!-- Month grid -->
      <div class="months-grid">
        @for (card of monthCards(); track card.monthNum) {
          <div
            class="month-card"
            [class.current]="card.isCurrent"
            [class.future]="card.isFuture"
            [class.has-data]="card.hasData"
            (click)="goToMonth(card.monthNum)">
            <div class="mc-header">
              <span class="mc-name">{{ card.name }}</span>
              @if (card.isCurrent) {
                <span class="current-pill">Mes actual</span>
              }
            </div>
            @if (card.hasData) {
              <div class="mc-amounts">
                <div class="mc-row">
                  <span class="mc-label">Ingresos</span>
                  <span class="mc-val positive">{{ card.ingresos | currency:'EUR':'symbol':'1.0-0':'es' }}</span>
                </div>
                <div class="mc-row">
                  <span class="mc-label">Gastos</span>
                  <span class="mc-val negative">{{ card.gastos | currency:'EUR':'symbol':'1.0-0':'es' }}</span>
                </div>
                @if (card.ahorros > 0) {
                  <div class="mc-row">
                    <span class="mc-label">Ahorrado</span>
                    <span class="mc-val positive">{{ card.ahorros | currency:'EUR':'symbol':'1.0-0':'es' }}</span>
                  </div>
                }
                <div class="mc-divider"></div>
                <div class="mc-row">
                  <span class="mc-label">Balance</span>
                  <span class="mc-val bold" [class.positive]="card.balance >= 0" [class.negative]="card.balance < 0">
                    {{ card.balance | currency:'EUR':'symbol':'1.0-0':'es' }}
                  </span>
                </div>
              </div>
            } @else if (!card.isFuture) {
              <p class="mc-empty">Sin datos</p>
            } @else {
              <p class="mc-future">Próximamente</p>
            }
            <div class="mc-cta">
              <i class="pi pi-arrow-right"></i>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .dashboard { display: flex; flex-direction: column; gap: 1.5rem; }

    .dash-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .dash-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--kakebo-indigo);
    }

    .year-nav {
      display: flex;
      align-items: center;
      gap: .75rem;
      font-weight: 700;
      color: var(--kakebo-indigo);
    }

    .year-btn {
      background: none;
      border: 1px solid var(--kakebo-borde);
      border-radius: 6px;
      padding: .3rem .5rem;
      cursor: pointer;
      color: var(--kakebo-indigo);
      &:hover { border-color: var(--kakebo-indigo); }
      &:disabled { opacity: .4; cursor: not-allowed; }
    }

    .annual-summary {
      display: flex;
      gap: .75rem;
      overflow-x: auto;
    }

    .summary-card {
      flex: 1;
      min-width: 120px;
      background: #fff;
      border: 1px solid var(--kakebo-borde);
      border-radius: 12px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: .25rem;

      &.accent {
        background: var(--kakebo-indigo);
        border-color: var(--kakebo-indigo);
        .s-label { color: rgba(255,255,255,.7); }
        .s-value { color: #fff; }
      }
    }

    .s-label {
      font-size: .7rem;
      color: var(--kakebo-texto-secundario);
      text-transform: uppercase;
      letter-spacing: .05em;
      font-weight: 600;
    }

    .s-value {
      font-size: 1.1rem;
      font-weight: 700;
      &.positive { color: var(--kakebo-verde); }
      &.negative { color: var(--kakebo-rojo-soft); }
    }

    .months-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: .75rem;
    }

    @media (max-width: 480px) {
      .months-grid { grid-template-columns: repeat(2, 1fr); }
    }

    .month-card {
      background: #fff;
      border: 1px solid var(--kakebo-borde);
      border-radius: 12px;
      padding: 1rem;
      cursor: pointer;
      position: relative;
      transition: box-shadow .15s, border-color .15s;

      &:hover:not(.future) {
        box-shadow: 0 4px 16px rgba(30,58,95,.1);
        border-color: var(--kakebo-indigo);
      }

      &.current {
        border-color: var(--kakebo-indigo);
        border-width: 2px;
        background: rgba(30,58,95,.02);
      }

      &.future {
        opacity: .5;
        cursor: default;
      }

      &:hover .mc-cta { opacity: 1; }
    }

    .mc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: .625rem;
    }

    .mc-name {
      font-weight: 700;
      font-size: .9rem;
      color: var(--kakebo-indigo);
    }

    .current-pill {
      font-size: .6rem;
      background: var(--kakebo-dorado);
      color: var(--kakebo-indigo);
      border-radius: 999px;
      padding: 1px 6px;
      font-weight: 700;
    }

    .mc-amounts { display: flex; flex-direction: column; gap: .25rem; }
    .mc-row { display: flex; justify-content: space-between; align-items: center; }
    .mc-label { font-size: .72rem; color: var(--kakebo-texto-secundario); }
    .mc-val { font-size: .8rem; font-weight: 600; &.positive{color:var(--kakebo-verde);} &.negative{color:var(--kakebo-rojo-soft);} &.bold{font-size:.85rem;} }
    .mc-divider { height: 1px; background: var(--kakebo-borde); margin: .25rem 0; }
    .mc-empty, .mc-future { font-size: .8rem; color: var(--kakebo-texto-secundario); margin: .5rem 0; }

    .mc-cta {
      position: absolute;
      bottom: .75rem;
      right: .75rem;
      color: var(--kakebo-indigo);
      opacity: 0;
      font-size: .75rem;
      transition: opacity .15s;
    }
  `]
})
export class DashboardComponent implements OnInit {
  year = signal(new Date().getFullYear());
  readonly currentYear = new Date().getFullYear();
  readonly currentMonth = new Date().getMonth() + 1;
  monthCards = signal<MonthCard[]>([]);

  totalIngresosYear = () => this.monthCards().reduce((s, m) => s + m.ingresos, 0);
  totalGastosYear = () => this.monthCards().reduce((s, m) => s + m.gastos, 0);
  totalAhorrosYear = () => this.monthCards().reduce((s, m) => s + m.ahorros, 0);
  balanceYear = () => this.totalIngresosYear() - this.totalGastosYear();

  constructor(
    private auth: AuthService,
    private supabase: SupabaseService,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.loadYear();
  }

  async changeYear(delta: number) {
    this.year.update(y => y + delta);
    await this.loadYear();
  }

  private async loadYear() {
    const { data: sessionData } = await this.supabase.client.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) return;

    const { data: months } = await this.supabase.client
      .from('months').select('id, month')
      .eq('user_id', uid).eq('year', this.year());

    const cards: MonthCard[] = await Promise.all(
      Array.from({ length: 12 }, async (_, i) => {
        const monthNum = i + 1;
        const isCurrent = monthNum === this.currentMonth && this.year() === this.currentYear;
        const isFuture = this.year() === this.currentYear ? monthNum > this.currentMonth : this.year() > this.currentYear;
        const rec = months?.find(m => m.month === monthNum);

        if (!rec) {
          return { monthNum, name: MONTH_NAMES[i], ingresos: 0, gastos: 0, ahorros: 0, balance: 0, hasData: false, isCurrent, isFuture };
        }

        const [{ data: ingresos }, { data: facturas }, { data: gastos }, { data: ahorros }, { data: pareja }, { data: fondos_monthly }, { data: deudas_monthly }] = await Promise.all([
          this.supabase.client.from('ingresos').select('real').eq('month_id', rec.id),
          this.supabase.client.from('facturas').select('real').eq('month_id', rec.id),
          this.supabase.client.from('gastos').select('real').eq('month_id', rec.id),
          this.supabase.client.from('ahorros').select('real').eq('month_id', rec.id),
          this.supabase.client.from('pareja').select('real').eq('month_id', rec.id),
          this.supabase.client.from('fondos_ahorro_monthly').select('real').eq('month_id', rec.id),
          this.supabase.client.from('deudas_monthly').select('real').eq('month_id', rec.id)
        ]);

        const sum = (arr: { real: number }[] | null) => (arr ?? []).reduce((s, r) => s + r.real, 0);
        const totalIngresos = sum(ingresos);
        const totalAhorros = sum(ahorros) + sum(fondos_monthly);
        const totalGastos = sum(facturas) + sum(gastos) + totalAhorros + sum(pareja) + sum(deudas_monthly);
        const hasData = totalIngresos > 0 || totalGastos > 0;

        return { monthNum, name: MONTH_NAMES[i], ingresos: totalIngresos, gastos: totalGastos, ahorros: totalAhorros, balance: totalIngresos - totalGastos, hasData, isCurrent, isFuture };
      })
    );

    this.monthCards.set(cards);
  }

  goToMonth(monthNum: number) {
    this.router.navigate(['/m', this.year(), monthNum]);
  }
}
