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

type IngresoField = 'fuente' | 'esperado' | 'real' | 'dia_de_paga' | 'depositado';

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
              <th class="col-dia-paga">Día de Paga</th>
              <th class="right">Esperado</th>
              <th class="right">Real</th>
              <th class="center col-depositado">✓</th>
              <th class="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            @for (row of sortedItems; track row.id) {
              <tr class="data-row" [class.row-editing]="editingCell()?.rowId === row.id">
                <!-- Fuente -->
                <td (click)="startEdit(row.id, 'fuente', row.fuente)">
                  @if (editingCell()?.rowId === row.id && editingCell()?.field === 'fuente') {
                    <input pInputText [(ngModel)]="editStr" class="cell-input"
                      (blur)="saveEdit(row)" (keydown.enter)="saveEdit(row)" (keydown.escape)="cancelEdit()" />
                  } @else { {{ row.fuente }} }
                </td>
                <!-- Día de paga -->
                <td class="cell-dia-paga" (click)="startEdit(row.id, 'dia_de_paga', row.dia_de_paga)">
                  @if (editingCell()?.rowId === row.id && editingCell()?.field === 'dia_de_paga') {
                    <p-calendar [(ngModel)]="editDate" dateFormat="dd/mm/yy"
                      [showIcon]="false" [defaultDate]="defaultDate" styleClass="cell-cal"
                      (onClose)="saveEdit(row)" />
                  } @else { {{ row.dia_de_paga ? (row.dia_de_paga | date:'dd/MM') : '—' }} }
                </td>
                <!-- Esperado -->
                <td class="right" (click)="startEdit(row.id, 'esperado', row.esperado)">
                  @if (editingCell()?.rowId === row.id && editingCell()?.field === 'esperado') {
                    <p-inputNumber [(ngModel)]="editNum" mode="currency" currency="EUR" locale="es-ES"
                      styleClass="cell-number" [inputStyle]="{width:'100%'}"
                      (onBlur)="saveEdit(row)" (keydown.enter)="saveEdit(row)" (keydown.escape)="cancelEdit()" />
                  } @else { {{ row.esperado | currency:'EUR':'symbol':'1.2-2':'es' }} }
                </td>
                <!-- Real -->
                <td class="right" (click)="startEdit(row.id, 'real', row.real)">
                  @if (editingCell()?.rowId === row.id && editingCell()?.field === 'real') {
                    <p-inputNumber [(ngModel)]="editNum" mode="currency" currency="EUR" locale="es-ES"
                      styleClass="cell-number" [inputStyle]="{width:'100%'}"
                      (onBlur)="saveEdit(row)" (keydown.enter)="saveEdit(row)" (keydown.escape)="cancelEdit()" />
                  } @else { {{ row.real | currency:'EUR':'symbol':'1.2-2':'es' }} }
                </td>
                <!-- Depositado toggle -->
                <td class="center cell-depositado">
                  <i [class]="row.depositado ? 'pi pi-check-circle' : 'pi pi-circle'"
                     [style.color]="row.depositado ? 'var(--kakebo-verde)' : 'var(--kakebo-borde)'"
                     style="cursor:pointer;font-size:1rem"
                     (click)="toggleDepositado(row)"></i>
                </td>
                <!-- Delete -->
                <td class="action-cell">
                  <button class="icon-btn delete" (click)="onDelete(row.id)"><i class="pi pi-trash"></i></button>
                </td>
              </tr>
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
    .budget-tbl { width: 100%; border-collapse: collapse; font-size: .85rem; table-layout: fixed;
      th { padding: .5rem .4rem; border-bottom: 2px solid var(--kakebo-borde); color: var(--kakebo-texto-secundario); font-size: .73rem; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; white-space: nowrap; overflow: hidden; }
      td { padding: .45rem .4rem; border-bottom: 1px solid var(--kakebo-borde); vertical-align: middle; overflow: hidden; cursor: pointer; }
      .right { text-align: right; }
      .center { text-align: center; }
      .col-dia-paga { width: 68px; }
      .col-actions { width: 34px; }
      .col-depositado { width: 32px; }
      .data-row:hover { background: rgba(30,58,95,.025); }
      .row-editing { background: rgba(30,58,95,.03); }
    }
    .empty-row { text-align:center; color:var(--kakebo-texto-secundario); padding:1.5rem; cursor:default; }
    .action-cell { text-align:right; cursor:default; }
    .cell-input { width: 100%; font-size:.85rem; padding:.1rem .2rem; }
    :host ::ng-deep .cell-number input { width:100% !important; font-size:.82rem; text-align:right; padding:.1rem .2rem !important; }
    :host ::ng-deep .cell-cal input { width:80px !important; font-size:.8rem; padding:.1rem .2rem !important; }
    .icon-btn { background:none; border:none; cursor:pointer; padding:.25rem .3rem; border-radius:4px; font-size:.8rem; transition:background .15s;
      &.delete { color:var(--kakebo-rojo-soft); &:hover{background:rgba(231,76,60,.1);} }
      &.save { color:var(--kakebo-verde); &:hover{background:rgba(39,174,96,.1);} }
      &.cancel { color:var(--kakebo-texto-secundario); &:hover{background:rgba(0,0,0,.05);} }
    }
    .add-row-form { display:flex; align-items:center; gap:.5rem; padding:.75rem 0 0; flex-wrap:wrap; }
    .add-input { flex:1; min-width:100px; font-size:.85rem; }
    .add-btn { display:flex; align-items:center; gap:.375rem; margin-top:.75rem; background:none; border:1px dashed var(--kakebo-borde); border-radius:8px; padding:.5rem 1rem; color:var(--kakebo-texto-secundario); font-size:.8rem; cursor:pointer; width:100%; justify-content:center; transition:border-color .15s, color .15s; &:hover{border-color:var(--kakebo-indigo);color:var(--kakebo-indigo);} }

    @media (max-width: 767px) {
      .budget-tbl {
        font-size: .78rem;
        th, td { padding: .35rem .25rem; }
        .col-dia-paga, .cell-dia-paga { display: none; }
        .col-depositado, .cell-depositado { display: none; }
        .col-actions { width: 28px; }
      }
    }
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

  editingCell = signal<{ rowId: string; field: IngresoField } | null>(null);
  addingRow = signal(false);

  editStr = '';
  editNum = 0;
  editDate: Date | null = null;

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

  startEdit(rowId: string, field: IngresoField, value: unknown) {
    this.editingCell.set({ rowId, field });
    if (field === 'fuente') this.editStr = value as string;
    else if (field === 'esperado' || field === 'real') this.editNum = value as number;
    else if (field === 'dia_de_paga') this.editDate = value ? this.parseLocalDate(value as string) : null;
  }

  async saveEdit(row: Ingreso) {
    const cell = this.editingCell();
    if (!cell || cell.rowId !== row.id) return;
    const update: Partial<Ingreso> = {};
    if (cell.field === 'fuente') update.fuente = this.editStr;
    else if (cell.field === 'esperado') update.esperado = this.editNum;
    else if (cell.field === 'real') update.real = this.editNum;
    else if (cell.field === 'dia_de_paga') update.dia_de_paga = this.editDate ? this.formatLocalDate(this.editDate) : null;
    this.editingCell.set(null);
    await this.service.update(row.id, update);
    this.changed.emit();
  }

  cancelEdit() { this.editingCell.set(null); }

  async toggleDepositado(row: Ingreso) {
    await this.service.update(row.id, { depositado: !row.depositado });
    this.changed.emit();
  }

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