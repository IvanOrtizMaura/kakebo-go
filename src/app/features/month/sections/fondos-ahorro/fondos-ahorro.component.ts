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
  template: `
    <div class="kakebo-card">
      <div class="section-header">
        <div style="display:flex;align-items:center;gap:.5rem">
          <h2>Fondos de Ahorro</h2>
          <i class="pi pi-info-circle" style="color:var(--kakebo-texto-secundario);font-size:.85rem"
             title="Ahorros programados a 11 meses para gastos puntuales: seguro del coche, vacaciones, navidades... Divides el total entre 11 meses para que no duela cuando llegue."></i>
        </div>
        <button class="add-btn-inline" (click)="showCreateDialog.set(true)">
          <i class="pi pi-plus"></i> Nuevo fondo
        </button>
      </div>

      @if (fondos().length === 0) {
        <p class="empty-msg">Sin fondos activos. Crea tu primer fondo de ahorro.</p>
      }

      @for (f of fondos(); track f.id) {
        <div class="fondo-item">
          <div class="fondo-row">
            <div class="fondo-info">
              <span class="fondo-name">{{ f.name }}</span>
              <span class="fondo-amounts">
                {{ f.monthly_amount | currency:'EUR':'symbol':'1.2-2':'es' }}/mes
                · Total: {{ f.total_amount | currency:'EUR':'symbol':'1.2-2':'es' }}
              </span>
            </div>
            <div class="fondo-real">
              <span class="fondo-months">Mes {{ f.completedMonths }}/11</span>
              <span [class]="'fondo-pct ' + (f.progress >= 100 ? 'done' : '')">{{ f.progress | number:'1.0-0' }}%</span>
            </div>
          </div>
          <p-progressBar [value]="f.progress" [showValue]="false"
            styleClass="fondo-progress" />
          @if (f.progress >= 100) {
            <div class="fondo-complete-row">
              <span class="complete-badge">¡Objetivo alcanzado! 🎉</span>
              <button class="icon-btn-sm" (click)="onFondoComplete(f)">Renovar fondo</button>
            </div>
          }
        </div>
      }

      <!-- Create fondo dialog -->
      <p-dialog header="Nuevo fondo de ahorro" [(visible)]="showCreateDialog" [modal]="true"
        [style]="{width:'min(380px, 95vw)'}" [draggable]="false">
        <div class="dialog-form">
          <div class="field">
            <label>Nombre del fondo</label>
            <input pInputText [(ngModel)]="newFondo.name" placeholder="Ej: Seguro del coche" class="w-full" />
          </div>
          <div class="field">
            <label>Importe total a ahorrar (€)</label>
            <p-inputNumber [(ngModel)]="newFondo.total_amount" mode="currency" currency="EUR"
              locale="es-ES" styleClass="w-full" (ngModelChange)="calcMonthly()" />
          </div>
          <div class="field">
            <label>Cuota mensual (total ÷ 11)</label>
            <p-inputNumber [(ngModel)]="newFondo.monthly_amount" mode="currency" currency="EUR"
              locale="es-ES" styleClass="w-full" [readonly]="true" />
          </div>
        </div>
        <ng-template #footer>
          <p-button label="Cancelar" styleClass="p-button-text" (onClick)="showCreateDialog.set(false)" />
          <p-button label="Crear fondo" styleClass="btn-primary" [loading]="saving()" (onClick)="createFondo()" />
        </ng-template>
      </p-dialog>

      <!-- Renew dialog -->
      <p-dialog header="Renovar fondo" [(visible)]="showRenewDialog" [modal]="true"
        [style]="{width:'min(380px, 95vw)'}" [draggable]="false">
        <p style="margin-bottom:1rem;color:var(--kakebo-texto-secundario);font-size:.9rem">
          ¡Enhorabuena! Has completado el fondo <strong>{{ renewingFondo()?.name }}</strong>.
          ¿Quieres crear uno nuevo para el próximo ciclo?
        </p>
        <div class="field">
          <label>Nuevo importe total (€)</label>
          <p-inputNumber [(ngModel)]="renewAmount" mode="currency" currency="EUR"
            locale="es-ES" styleClass="w-full" (ngModelChange)="renewMonthly = renewAmount / 11" />
        </div>
        <ng-template #footer>
          <p-button label="No, archivar" styleClass="p-button-text" (onClick)="archiveFondo()" />
          <p-button label="Crear nuevo ciclo" styleClass="btn-primary" [loading]="saving()" (onClick)="renewFondo()" />
        </ng-template>
      </p-dialog>

      <p-confirmDialog />
    </div>
  `,
  styles: [`
    .section-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:.75rem; }
    .add-btn-inline { background:none; border:1px solid var(--kakebo-borde); border-radius:6px; padding:.3rem .75rem; font-size:.8rem; color:var(--kakebo-indigo); cursor:pointer; display:flex; align-items:center; gap:.35rem; transition:border-color .15s; &:hover{border-color:var(--kakebo-indigo);} }
    .empty-msg { color:var(--kakebo-texto-secundario); font-size:.875rem; text-align:center; padding:1.5rem 0; }
    .fondo-item { border:1px solid var(--kakebo-borde); border-radius:10px; padding:.875rem; margin-bottom:.75rem; }
    .fondo-row { display:flex; justify-content:space-between; align-items:flex-start; gap:.5rem; margin-bottom:.5rem; }
    .fondo-info { display:flex; flex-direction:column; gap:.2rem; }
    .fondo-name { font-weight:700; color:var(--kakebo-indigo); font-size:.9rem; }
    .fondo-amounts { font-size:.75rem; color:var(--kakebo-texto-secundario); }
    .fondo-real { display:flex; align-items:center; gap:.5rem; text-align:right; }
    .fondo-months { font-size:.75rem; color:var(--kakebo-texto-secundario); white-space:nowrap; }
    .fondo-pct { font-size:.875rem; font-weight:700; color:var(--kakebo-indigo); white-space:nowrap; &.done{color:var(--kakebo-verde);} }
    :host ::ng-deep .fondo-progress .p-progressbar { height:6px; border-radius:999px; background:var(--kakebo-borde); .p-progressbar-value { background:var(--kakebo-dorado); border-radius:999px; } }
    .fondo-complete-row { display:flex; align-items:center; justify-content:space-between; margin-top:.5rem; }
    .complete-badge { font-size:.75rem; color:var(--kakebo-verde); font-weight:600; }
    .icon-btn-sm { background:var(--kakebo-indigo); color:#fff; border:none; border-radius:6px; padding:.25rem .75rem; font-size:.75rem; cursor:pointer; }
    .btn-primary { background:var(--kakebo-indigo) !important; border-color:var(--kakebo-indigo) !important; }
    .dialog-form { display:flex; flex-direction:column; gap:.875rem; }
    .field { display:flex; flex-direction:column; gap:.375rem; label { font-size:.85rem; font-weight:600; color:var(--kakebo-texto-principal); } }
  `]
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
