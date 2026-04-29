import { Component, Input, OnChanges, Output, EventEmitter, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressBarModule } from 'primeng/progressbar';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DeudasService } from '../../../../shared/services/deudas.service';
import { Deuda, DeudaMonthly } from '../../../../shared/models';

interface DeudaWithMonthly extends Deuda {
  monthly?: DeudaMonthly;
  progress: number;
}

@Component({
  selector: 'app-deudas',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DecimalPipe, ButtonModule, InputNumberModule, ProgressBarModule, ConfirmDialogModule, ToastModule],
  providers: [ConfirmationService, MessageService],
  templateUrl: './deudas.component.html',
  styleUrl: './deudas.component.scss'
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

  constructor(
    private service: DeudasService,
    private confirmationService: ConfirmationService,
    private messageService: MessageService
  ) {}

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

  confirmArchive(d: Deuda) {
    this.confirmationService.confirm({
      message: `¿Archivar deuda "${d.name}"?`,
      header: 'Confirmar',
      icon: 'pi pi-inbox',
      accept: async () => {
        try {
          await this.service.archive(d.id);
          this.messageService.add({ severity: 'success', summary: 'Archivada', detail: 'Deuda archivada correctamente', life: 2000 });
          await this.load();
        } catch (e) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo archivar la deuda', life: 2000 });
        }
      }
    });
  }

  confirmUnarchive(d: Deuda) {
    this.confirmationService.confirm({
      message: `¿Restaurar deuda "${d.name}"?`,
      header: 'Confirmar',
      icon: 'pi pi-replay',
      accept: async () => {
        try {
          await this.service.unarchive(d.id);
          this.messageService.add({ severity: 'success', summary: 'Restaurada', detail: 'Deuda restaurada correctamente', life: 2000 });
          await this.load();
        } catch (e) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo restaurar la deuda', life: 2000 });
        }
      }
    });
  }

  confirmDelete(d: Deuda) {
    this.confirmationService.confirm({
      message: `¿Eliminar deuda "${d.name}" permanentemente?`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.service.delete(d.id);
          this.messageService.add({ severity: 'success', summary: 'Eliminada', detail: 'Deuda eliminada correctamente', life: 2000 });
          await this.load();
        } catch (e) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar la deuda', life: 2000 });
        }
      }
    });
  }

}