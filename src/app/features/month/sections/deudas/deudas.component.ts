import { Component, Input, OnChanges, Output, EventEmitter, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressBarModule } from 'primeng/progressbar';
import { DeudasService } from '../../../../shared/services/deudas.service';
import { Deuda, DeudaMonthly } from '../../../../shared/models';

interface DeudaWithMonthly extends Deuda {
  monthly?: DeudaMonthly;
  progress: number;
}

@Component({
  selector: 'app-deudas',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, ButtonModule, InputNumberModule, ProgressBarModule],
  template: `
    <div class="kakebo-card">
      <div class="section-header">
        <div style="display:flex;align-items:center;gap:.5rem">
          <h2>Deudas</h2>
          <i class="pi pi-info-circle" style="color:var(--kakebo-texto-secundario);font-size:.85rem"
             title="Registro de tus deudas. Gestiona tus deudas desde Configuración."></i>
        </div>
      </div>

      @if (deudas().length === 0) {
        <p class="empty-msg">
          Sin deudas activas. ¡Eso es buena señal! 🎉<br>
          <span style="font-size:.78rem;color:var(--kakebo-texto-secundario)">
            Gestiona tus deudas desde <strong>Configuración</strong>.
          </span>
        </p>
      }

      @for (d of deudas(); track d.id) {
        <div class="deuda-item">
          <div class="deuda-header">
            <div class="deuda-info">
              <span class="deuda-name">{{ d.name }}</span>
              <span class="deuda-type-badge" [class.bank]="d.type === 'bank'" [class.savings]="d.type === 'savings'">
                {{ d.type === 'bank' ? 'Préstamo ' + d.interest_rate + '%' : 'Préstamo personal' }}
              </span>
            </div>
            <div class="deuda-amounts">
              <span class="deuda-remaining">{{ d.amount_remaining | currency:'EUR':'symbol':'1.2-2':'es' }}</span>
              <span class="deuda-total">/ {{ d.total_amount | currency:'EUR':'symbol':'1.2-2':'es' }}</span>
            </div>
          </div>
          <p-progressBar [value]="d.progress" [showValue]="false" styleClass="deuda-progress" />
          <div class="deuda-monthly-row">
            <div class="mo-info">
              <span class="mo-label">Cuota:</span>
              <span class="mo-value">{{ d.monthly_payment | currency:'EUR':'symbol':'1.2-2':'es' }}</span>
            </div>
            <div class="mo-real">
              <span class="mo-label">Pagado este mes:</span>
              @if (editingMonthlyId() === d.id) {
                <p-inputNumber [(ngModel)]="editingAmount" mode="currency" currency="EUR" locale="es-ES" [inputStyle]="{width:'100px'}" />
                <button class="icon-btn save" (click)="saveMonthly(d)"><i class="pi pi-check"></i></button>
                <button class="icon-btn cancel" (click)="editingMonthlyId.set(null)"><i class="pi pi-times"></i></button>
              } @else {
                <span class="mo-value">{{ d.monthly?.real ?? 0 | currency:'EUR':'symbol':'1.2-2':'es' }}</span>
                <button class="icon-btn edit" (click)="startMonthly(d)"><i class="pi pi-pencil"></i></button>
              }
            </div>
          </div>
        </div>
      }

      <!-- Archived toggle -->
      <button class="archived-toggle" (click)="toggleArchived()">
        <i class="pi pi-archive"></i>
        {{ showArchived() ? 'Ocultar archivadas' : 'Ver deudas archivadas' }}
      </button>

      @if (showArchived()) {
        @for (d of archived(); track d.id) {
          <div class="deuda-item archived">
            <div class="deuda-header">
              <span class="deuda-name">{{ d.name }}</span>
              <span class="archived-badge">Pagada ✓</span>
            </div>
            <p-progressBar [value]="100" [showValue]="false" styleClass="deuda-progress done" />
          </div>
        }
        @if (archived().length === 0) {
          <p class="empty-msg" style="padding:.5rem 0">Sin deudas archivadas.</p>
        }
      }
    </div>
  `,
  styles: [`
    .section-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:.75rem; }
    .empty-msg { color:var(--kakebo-texto-secundario); font-size:.875rem; text-align:center; padding:1.5rem 0; line-height:1.6; }
    .deuda-item { border:1px solid var(--kakebo-borde); border-radius:10px; padding:.875rem; margin-bottom:.75rem; &.archived{opacity:.6;} }
    .deuda-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:.5rem; gap:.5rem; }
    .deuda-info { display:flex; flex-direction:column; gap:.2rem; }
    .deuda-name { font-weight:700; color:var(--kakebo-indigo); font-size:.9rem; }
    .deuda-type-badge { font-size:.7rem; padding:2px 7px; border-radius:999px; font-weight:600; &.bank{background:rgba(30,58,95,.1);color:var(--kakebo-indigo);} &.savings{background:rgba(197,160,89,.15);color:#8a6d2e;} }
    .deuda-amounts { text-align:right; .deuda-remaining{font-weight:700;font-size:.95rem;color:var(--kakebo-rojo-soft);display:block;} .deuda-total{font-size:.75rem;color:var(--kakebo-texto-secundario);} }
    :host ::ng-deep .deuda-progress .p-progressbar { height:6px; border-radius:999px; background:var(--kakebo-borde); .p-progressbar-value{background:var(--kakebo-rojo);border-radius:999px;} }
    :host ::ng-deep .deuda-progress.done .p-progressbar { .p-progressbar-value{background:var(--kakebo-verde);} }
    .deuda-monthly-row { display:flex; justify-content:space-between; align-items:center; margin-top:.5rem; flex-wrap:wrap; gap:.5rem; .mo-label{font-size:.75rem;color:var(--kakebo-texto-secundario);} .mo-value{font-weight:600;font-size:.85rem;margin-left:.25rem;} }
    .mo-info,.mo-real { display:flex; align-items:center; gap:.25rem; }
    .icon-btn { background:none; border:none; cursor:pointer; padding:.25rem .3rem; border-radius:4px; font-size:.8rem; transition:background .15s;
      &.edit{color:var(--kakebo-indigo);&:hover{background:rgba(30,58,95,.1);}}
      &.save{color:var(--kakebo-verde);&:hover{background:rgba(39,174,96,.1);}}
      &.cancel{color:var(--kakebo-texto-secundario);&:hover{background:rgba(0,0,0,.05);}}
    }
    .archived-toggle { background:none; border:none; color:var(--kakebo-texto-secundario); font-size:.8rem; cursor:pointer; display:flex; align-items:center; gap:.375rem; padding:.5rem 0; &:hover{color:var(--kakebo-indigo);} }
    .archived-badge { font-size:.75rem; color:var(--kakebo-verde); font-weight:600; }
  `]
})
export class DeudasComponent implements OnChanges {
  @Input() monthId = '';
  @Input() userId = '';
  @Output() totalsChanged = new EventEmitter<{ presupuestado: number; real: number }>();

  deudas = signal<DeudaWithMonthly[]>([]);
  archived = signal<Deuda[]>([]);
  showArchived = signal(false);
  editingMonthlyId = signal<string | null>(null);
  editingAmount = 0;

  constructor(private service: DeudasService) {}

  async ngOnChanges() {
    if (this.userId && this.monthId) await this.load();
  }

  private async load() {
    const [active, monthlies] = await Promise.all([
      this.service.getActive(this.userId),
      this.service.getMonthlyByMonth(this.monthId)
    ]);

    for (const d of active) {
      const exists = monthlies.find(m => m.deuda_id === d.id);
      if (!exists) {
        await this.service.upsertMonthly({
          deuda_id: d.id,
          month_id: this.monthId,
          user_id: this.userId,
          presupuestado: d.monthly_payment,
          real: 0
        });
      }
    }

    const freshMonthlies = await this.service.getMonthlyByMonth(this.monthId);

    const result: DeudaWithMonthly[] = active.map(d => ({
      ...d,
      monthly: freshMonthlies.find(m => m.deuda_id === d.id),
      progress: Math.min(100, ((d.total_amount - d.amount_remaining) / d.total_amount) * 100)
    }));

    this.deudas.set(result);

    if (this.showArchived()) {
      this.archived.set(await this.service.getArchived(this.userId));
    }

    this.totalsChanged.emit({
      presupuestado: active.reduce((s, d) => s + d.monthly_payment, 0),
      real: freshMonthlies.reduce((s, m) => s + m.real, 0)
    });
  }

  toggleArchived() {
    this.showArchived.update(v => !v);
    if (this.showArchived()) {
      this.service.getArchived(this.userId).then(a => this.archived.set(a));
    }
  }

  startMonthly(d: DeudaWithMonthly) {
    this.editingMonthlyId.set(d.id);
    this.editingAmount = d.monthly?.real ?? d.monthly_payment;
  }

  async saveMonthly(d: DeudaWithMonthly) {
    await this.service.applyPayment(d.id, this.monthId, this.editingAmount);
    this.editingMonthlyId.set(null);
    await this.load();
  }
}
