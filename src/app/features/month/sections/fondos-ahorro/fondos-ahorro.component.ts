import { Component, Input, OnChanges, Output, EventEmitter, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressBarModule } from 'primeng/progressbar';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { FondosAhorroService } from '../../../../shared/services/fondos-ahorro.service';
import { FondoAhorro, FondoAhorroMonthly } from '../../../../shared/models';

interface FondoWithProgress extends FondoAhorro {
  monthly?: FondoAhorroMonthly;
  completedMonths: number;
  progress: number;
}

@Component({
  selector: 'app-fondos-ahorro',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DecimalPipe, ButtonModule, InputTextModule, InputNumberModule, ProgressBarModule, DialogModule, ConfirmDialogModule],
  providers: [ConfirmationService],
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

  newFondo = { name: '', total_amount: 0, monthly_amount: 0 };
  renewAmount = 0;
  renewMonthly = 0;

  constructor(private service: FondosAhorroService) {}

  async ngOnChanges() {
    if (this.userId && this.monthId) await this.load();
  }

  private async load() {
    const active = await this.service.getActive(this.userId);
    const monthlies = await this.service.getMonthlyByMonth(this.monthId);

    const result: FondoWithProgress[] = await Promise.all(active.map(async f => {
      const count = await this.service.countCompletedMonths(f.id);
      const monthly = monthlies.find(m => m.fondo_id === f.id);
      const progress = Math.min(100, (count / 11) * 100);
      return { ...f, monthly, completedMonths: count, progress };
    }));

    this.fondos.set(result);
    this.emitTotals(result, monthlies);
  }

  private emitTotals(fondos: FondoWithProgress[], monthlies: { fondo_id: string; presupuestado: number; real: number }[]) {
    const presupuestado = fondos.reduce((s, f) => s + f.monthly_amount, 0);
    const real = monthlies.reduce((s, m) => s + m.real, 0);
    this.totalsChanged.emit({ presupuestado, real });
  }

  calcMonthly() {
    this.newFondo.monthly_amount = this.newFondo.total_amount / 11;
  }

  async createFondo() {
    if (!this.newFondo.name.trim()) return;
    this.saving.set(true);
    try {
      const today = new Date();
      const fondo = await this.service.create({
        user_id: this.userId,
        name: this.newFondo.name.trim(),
        total_amount: this.newFondo.total_amount,
        monthly_amount: this.newFondo.total_amount / 11,
        num_months: 11,
        start_year: today.getFullYear(),
        start_month: today.getMonth() + 1,
        is_active: true
      });
      await this.service.upsertMonthly({
        fondo_id: fondo.id,
        month_id: this.monthId,
        user_id: this.userId,
        presupuestado: fondo.monthly_amount,
        real: 0
      });
      this.newFondo = { name: '', total_amount: 0, monthly_amount: 0 };
      this.showCreateDialog.set(false);
      await this.load();
    } finally {
      this.saving.set(false);
    }
  }

  onFondoComplete(fondo: FondoWithProgress) {
    this.renewingFondo.set(fondo);
    this.renewAmount = fondo.total_amount;
    this.renewMonthly = fondo.total_amount / 11;
    this.showRenewDialog.set(true);
  }

  async archiveFondo() {
    const f = this.renewingFondo();
    if (!f) return;
    await this.service.deactivate(f.id);
    this.showRenewDialog.set(false);
    await this.load();
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
        monthly_amount: this.renewAmount / 11,
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
