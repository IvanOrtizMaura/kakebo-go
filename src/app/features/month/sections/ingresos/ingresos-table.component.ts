import { Component, Input, OnChanges, Output, EventEmitter, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { CalendarModule } from 'primeng/calendar';
import { IngresosService } from '../../../../shared/services/ingresos.service';
import { Ingreso } from '../../../../shared/models';

@Component({
  selector: 'app-ingresos-table',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe, ButtonModule, InputTextModule, InputNumberModule, CheckboxModule, CalendarModule],
  template: `
    <div class="kakebo-card">
      <div class="section-header">
        <div style="display:flex;align-items:center;gap:.5rem">
          <h2>Ingresos</h2>
          <i class="pi pi-info-circle" style="color:var(--kakebo-texto-secundario);font-size:.85rem"
             title="Tus fuentes de ingreso: nómina, autónomo, alquiler..."></i>
        </div>
        <span style="font-size:.8rem;color:var(--kakebo-texto-secundario)">
          Total: <strong>{{ total() | currency:'EUR':'symbol':'1.2-2':'es' }}</strong>
        </span>
      </div>

      <div class="table-wrapper">
        <table class="budget-tbl">
          <thead>
            <tr>
              <th>Fuente</th>
              <th>Día de Paga</th>
              <th class="right">Esperado</th>
              <th class="right">Real</th>
              <th class="center">Depositado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (row of sortedItems; track row.id) {
              @if (editingId() === row.id) {
                <tr class="editing-row">
                  <td><input pInputText [(ngModel)]="eData.fuente" class="edit-input" /></td>
                  <td>
                    <p-calendar [(ngModel)]="eData.dia_de_paga" dateFormat="dd/mm/yy"
                      [showIcon]="false" [defaultDate]="defaultDate" styleClass="edit-cal" />
                  </td>
                  <td>
                    <p-inputNumber [(ngModel)]="eData.esperado" mode="currency" currency="EUR"
                      locale="es-ES" [inputStyle]="{width:'90px'}" />
                  </td>
                  <td>
                    <p-inputNumber [(ngModel)]="eData.real" mode="currency" currency="EUR"
                      locale="es-ES" [inputStyle]="{width:'90px'}" />
                  </td>
                  <td class="center">
                    <p-checkbox [(ngModel)]="eData.depositado" [binary]="true" />
                  </td>
                  <td class="action-cell">
                    <button class="icon-btn save" (click)="saveEdit(row.id)"><i class="pi pi-check"></i></button>
                    <button class="icon-btn cancel" (click)="cancelEdit()"><i class="pi pi-times"></i></button>
                  </td>
                </tr>
              } @else {
                <tr class="data-row">
                  <td>{{ row.fuente }}</td>
                  <td>{{ row.dia_de_paga ? (row.dia_de_paga | date:'dd/MM') : '—' }}</td>
                  <td class="right">{{ row.esperado | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
                  <td class="right">{{ row.real | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
                  <td class="center">
                    <i [class]="row.depositado ? 'pi pi-check-circle' : 'pi pi-circle'"
                       [style.color]="row.depositado ? 'var(--kakebo-verde)' : 'var(--kakebo-borde)'"></i>
                  </td>
                  <td class="action-cell">
                    <button class="icon-btn edit" (click)="startEdit(row)"><i class="pi pi-pencil"></i></button>
                    <button class="icon-btn delete" (click)="onDelete(row.id)"><i class="pi pi-trash"></i></button>
                  </td>
                </tr>
              }
            }
            @if (items.length === 0) {
              <tr><td colspan="6" class="empty-row">Sin ingresos registrados.</td></tr>
            }
          </tbody>
        </table>
      </div>

      @if (addingRow()) {
        <div class="add-row-form">
          <input pInputText [(ngModel)]="nData.fuente" placeholder="Fuente" class="add-input" />
          <p-calendar [(ngModel)]="nData.dia_de_paga" dateFormat="dd/mm/yy" placeholder="Día de paga" [defaultDate]="defaultDate" styleClass="add-cal" />
          <p-inputNumber [(ngModel)]="nData.esperado" mode="currency" currency="EUR" locale="es-ES"
            placeholder="Esperado" [inputStyle]="{width:'110px'}" />
          <button class="icon-btn save" (click)="confirmAdd()"><i class="pi pi-check"></i></button>
          <button class="icon-btn cancel" (click)="addingRow.set(false)"><i class="pi pi-times"></i></button>
        </div>
      } @else {
        <button class="add-btn" (click)="addingRow.set(true)"><i class="pi pi-plus"></i> Añadir ingreso</button>
      }
    </div>
  `,
  styles: [`
    .table-wrapper { overflow-x: auto; }
    .budget-tbl { width: 100%; border-collapse: collapse; font-size: .85rem;
      th { padding: .5rem; border-bottom: 2px solid var(--kakebo-borde); color: var(--kakebo-texto-secundario); font-size: .73rem; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; white-space: nowrap; }
      td { padding: .5rem; border-bottom: 1px solid var(--kakebo-borde); vertical-align: middle; }
      .right { text-align: right; }
      .center { text-align: center; }
      .data-row:hover { background: rgba(30,58,95,.025); }
    }
    .empty-row { text-align:center; color:var(--kakebo-texto-secundario); padding:1.5rem; }
    .editing-row td { background: rgba(30,58,95,.03); }
    .edit-input { width: 100%; font-size:.85rem; }
    .action-cell { text-align:right; white-space:nowrap; }
    .icon-btn { background:none; border:none; cursor:pointer; padding:.25rem .3rem; border-radius:4px; font-size:.8rem; transition:background .15s;
      &.edit { color:var(--kakebo-indigo); &:hover{background:rgba(30,58,95,.1);} }
      &.delete { color:var(--kakebo-rojo-soft); &:hover{background:rgba(231,76,60,.1);} }
      &.save { color:var(--kakebo-verde); &:hover{background:rgba(39,174,96,.1);} }
      &.cancel { color:var(--kakebo-texto-secundario); &:hover{background:rgba(0,0,0,.05);} }
    }
    .add-row-form { display:flex; align-items:center; gap:.5rem; padding:.75rem 0 0; flex-wrap:wrap; }
    .add-input { flex:1; min-width:100px; font-size:.85rem; }
    .add-btn { display:flex; align-items:center; gap:.375rem; margin-top:.75rem; background:none; border:1px dashed var(--kakebo-borde); border-radius:8px; padding:.5rem 1rem; color:var(--kakebo-texto-secundario); font-size:.8rem; cursor:pointer; width:100%; justify-content:center; transition:border-color .15s, color .15s; &:hover{border-color:var(--kakebo-indigo);color:var(--kakebo-indigo);} }
  `]
})
export class IngresosTableComponent implements OnChanges {
  @Input() items: Ingreso[] = [];
  @Input() monthId = '';
  @Input() userId = '';
  @Input() year = new Date().getFullYear();
  @Input() month = new Date().getMonth() + 1;
  @Output() changed = new EventEmitter<void>();

  defaultDate = new Date(this.year, this.month - 1, 1);

  ngOnChanges() {
    this.defaultDate = new Date(this.year, this.month - 1, 1);
  }

  get sortedItems(): Ingreso[] {
    return [...this.items].sort((a, b) => {
      if (!a.dia_de_paga && !b.dia_de_paga) return 0;
      if (!a.dia_de_paga) return 1;
      if (!b.dia_de_paga) return -1;
      return a.dia_de_paga.localeCompare(b.dia_de_paga);
    });
  }

  editingId = signal<string | null>(null);
  addingRow = signal(false);

  eData = { fuente: '', dia_de_paga: null as Date | null, esperado: 0, real: 0, depositado: false };
  nData = { fuente: '', dia_de_paga: null as Date | null, esperado: 0 };

  total() { return this.items.reduce((s, i) => s + i.esperado, 0); }

  constructor(private service: IngresosService) {}

  private parseLocalDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private formatLocalDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  startEdit(row: Ingreso) {
    this.editingId.set(row.id);
    this.eData = {
      fuente: row.fuente,
      dia_de_paga: row.dia_de_paga ? this.parseLocalDate(row.dia_de_paga) : null,
      esperado: row.esperado,
      real: row.real,
      depositado: row.depositado
    };
  }

  async saveEdit(id: string) {
    await this.service.update(id, {
      fuente: this.eData.fuente,
      dia_de_paga: this.eData.dia_de_paga ? this.formatLocalDate(this.eData.dia_de_paga) : null,
      esperado: this.eData.esperado,
      real: this.eData.real,
      depositado: this.eData.depositado
    });
    this.editingId.set(null);
    this.changed.emit();
  }

  cancelEdit() { this.editingId.set(null); }

  async confirmAdd() {
    if (!this.nData.fuente.trim()) return;
    await this.service.add({
      month_id: this.monthId,
      user_id: this.userId,
      fuente: this.nData.fuente.trim(),
      dia_de_paga: this.nData.dia_de_paga ? this.formatLocalDate(this.nData.dia_de_paga) : null,
      esperado: this.nData.esperado,
      real: 0,
      depositado: false,
      order_index: this.items.length
    });
    this.nData = { fuente: '', dia_de_paga: null, esperado: 0 };
    this.addingRow.set(false);
    this.changed.emit();
  }

  async onDelete(id: string) {
    await this.service.remove(id);
    this.changed.emit();
  }
}
