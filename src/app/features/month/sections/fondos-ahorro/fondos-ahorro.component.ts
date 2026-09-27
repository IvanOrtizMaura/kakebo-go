import { Component, Input, OnChanges, Output, EventEmitter, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressBarModule } from 'primeng/progressbar';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { FondosAhorroService } from '../../../../shared/services/fondos-ahorro.service';
import { FondoAhorro, FondoAhorroMonthly } from '../../../../shared/models';

interface FondoWithProgress extends FondoAhorro {
  monthly?: FondoAhorroMonthly;
  completedMonths: number;
  progress: number;
  totalMonths: number;
  monthsLeft: number;
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function calcNumMonths(startYear: number, startMonth: number, targetYear: number, targetMonth: number): number {
  const months = (targetYear - startYear) * 12 + (targetMonth - startMonth);
  return Math.max(1, months);
}

@Component({
  selector: 'app-fondos-ahorro',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DecimalPipe, ButtonModule, InputTextModule, InputNumberModule, ProgressBarModule, DialogModule, SelectModule],
  templateUrl: './fondos-ahorro.component.html',
  styleUrl: './fondos-ahorro.component.scss'
})
export class FondosAhorroComponent implements OnChanges {
  @Input() monthId = '';
  @Input() userId = '';
  @Output() totalsChanged = new EventEmitter<{ presupuestado: number; real: number }>();

  fondos = signal<FondoWithProgress[]>([]);
  showCreateDialog = signal(false);
  showRenewDialog = signal(false);
  renewingFondo = signal<FondoAhorro | null>(null);
  saving = signal(false);

  newFondo = { name: '', total_amount: 0, target_month: 0, target_year: 0 };
  renewAmount = 0;

  readonly monthOptions = MONTH_NAMES.map((label, i) => ({ label, value: i + 1 }));
  yearOptions: { label: string; value: number }[] = [];

  get newMonthly(): number {
    const { total_amount, target_month, target_year } = this.newFondo;
    if (!total_amount || !target_month || !target_year) return 0;
    const today = new Date();
    const n = calcNumMonths(today.getFullYear(), today.getMonth() + 1, target_year, target_month);
    return Math.ceil(total_amount / n);
  }

  constructor(private service: FondosAhorroService) {
    const currentYear = new Date().getFullYear();
    this.yearOptions = [currentYear, currentYear + 1, currentYear + 2].map(y => ({ label: String(y), value: y }));
    this.newFondo.target_year = currentYear;
  }

  async ngOnChanges() {
    if (this.userId && this.monthId) await this.load();
  }

  private async load() {
    const active = await this.service.getActive(this.userId);
    const monthlies = await this.service.getMonthlyByMonth(this.monthId);

    const result: FondoWithProgress[] = await Promise.all(active.map(async f => {
      const count = await this.service.countCompletedMonths(f.id);
      const monthly = monthlies.find(m => m.fondo_id === f.id);
      const totalMonths = f.num_months || 11;
      const progress = Math.min(100, Math.round((count / totalMonths) * 100));
      const monthsLeft = Math.max(0, totalMonths - count);
      return { ...f, monthly, completedMonths: count, progress, totalMonths, monthsLeft };
    }));

    this.fondos.set(result);
    this.emitTotals(result, monthlies);
  }

  private emitTotals(fondos: FondoWithProgress[], monthlies: { fondo_id: string; presupuestado: number; real: number }[]) {
    const presupuestado = fondos.reduce((s, f) => s + f.monthly_amount, 0);
    const real = monthlies.reduce((s, m) => s + m.real, 0);
    this.totalsChanged.emit({ presupuestado, real });
  }

  targetLabel(f: FondoAhorro): string {
    if (f.target_month && f.target_year) {
      return `${MONTH_NAMES[f.target_month - 1]} ${f.target_year}`;
    }
    return `${f.num_months} meses`;
  }

  async createFondo() {
    if (!this.newFondo.name.trim() || !this.newFondo.total_amount || !this.newFondo.target_month || !this.newFondo.target_year) return;
    this.saving.set(true);
    try {
      const today = new Date();
      const startYear = today.getFullYear();
      const startMonth = today.getMonth() + 1;
      const numMonths = calcNumMonths(startYear, startMonth, this.newFondo.target_year, this.newFondo.target_month);
      const monthlyAmount = Math.ceil(this.newFondo.total_amount / numMonths);

      const fondo = await this.service.create({
        user_id: this.userId,
        name: this.newFondo.name.trim(),
        total_amount: this.newFondo.total_amount,
        monthly_amount: monthlyAmount,
        num_months: numMonths,
        start_year: startYear,
        start_month: startMonth,
        target_year: this.newFondo.target_year,
        target_month: this.newFondo.target_month,
        is_active: true
      });
      await this.service.upsertMonthly({
        fondo_id: fondo.id,
        month_id: this.monthId,
        user_id: this.userId,
        presupuestado: monthlyAmount,
        real: 0
      });
      this.newFondo = { name: '', total_amount: 0, target_month: 0, target_year: new Date().getFullYear() };
      this.showCreateDialog.set(false);
      await this.load();
    } finally {
      this.saving.set(false);
    }
  }

  isPagado(fondo: FondoWithProgress): boolean {
    return (fondo.monthly?.real ?? 0) >= fondo.monthly_amount;
  }

  async togglePago(fondo: FondoWithProgress) {
    if (this.isPagado(fondo)) {
      await this.service.updateMonthlyReal(fondo.id, this.monthId, 0);
    } else {
      await this.service.upsertMonthly({
        fondo_id: fondo.id,
        month_id: this.monthId,
        user_id: this.userId,
        presupuestado: fondo.monthly_amount,
        real: fondo.monthly_amount
      });
    }
    await this.load();
  }

  onFondoComplete(fondo: FondoWithProgress) {
    this.renewingFondo.set(fondo);
    this.renewAmount = fondo.total_amount;
    this.showRenewDialog.set(true);
  }

  async archiveFondo() {
    const f = this.renewingFondo();
    if (!f) return;
    await this.service.deactivate(f.id);
    this.showRenewDialog.set(false);
    await this.load();
  }

  async renewFondo() {
    const f = this.renewingFondo();
    if (!f) return;
    this.saving.set(true);
    try {
      await this.service.deactivate(f.id);
      const today = new Date();
      const newFondo = await this.service.create({
        user_id: this.userId,
        name: f.name,
        total_amount: this.renewAmount,
        monthly_amount: Math.ceil(this.renewAmount / 11),
        num_months: 11,
        start_year: today.getFullYear(),
        start_month: today.getMonth() + 1,
        is_active: true
      });
      await this.service.upsertMonthly({
        fondo_id: newFondo.id,
        month_id: this.monthId,
        user_id: this.userId,
        presupuestado: newFondo.monthly_amount,
        real: 0
      });
      this.showRenewDialog.set(false);
      await this.load();
    } finally {
      this.saving.set(false);
    }
  }
}
