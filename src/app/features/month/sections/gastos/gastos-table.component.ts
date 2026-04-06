import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SectionService } from '../../../../shared/services/section.service';
import { Gasto } from '../../../../shared/models';

type GastoField = 'name' | 'presupuestado' | 'real';

@Component({
  selector: 'app-gastos-table',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, ButtonModule, InputTextModule, InputNumberModule, SelectButtonModule],
  template: `
    <div class="kakebo-card">
      <div class="section-header">
        <div style="display:flex;align-items:center;gap:.5rem">
          <h2>Gastos</h2>
          <i class="pi pi-info-circle" style="color:var(--kakebo-texto-secundario);font-size:.85rem"
             title="Gastos de ocio y gastos hormiga: restaurantes, ropa, transporte, suscripciones..."></i>
        </div>
        <span style="font-size:.8rem;color:var(--kakebo-texto-secundario)">
          Total: <strong>{{ totalP() | currency:'EUR':'symbol':'1.2-2':'es' }}</strong>
          / <span>{{ totalR() | currency:'EUR':'symbol':'1.2-2':'es' }}</span>
        </span>
      </div>

      <div class="table-wrapper">
        <table class="budget-tbl">
          <thead>
            <tr>
              <th>Descripción</th>
              <th class="right col-amt-presupuesto">Presupuesto</th>
              <th class="right">Real</th>
              <th class="right col-diff">Dif.</th>
              <th class="col-tipo">Tipo</th>
              <th class="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            @for (row of items; track row.id) {
              <tr class="data-row" [class.row-editing]="editingCell()?.rowId === row.id">
                <td (click)="startEdit(row.id, 'name', row.name)">
                  @if (editingCell()?.rowId === row.id && editingCell()?.field === 'name') {
                    <input pInputText [(ngModel)]="editStr" class="cell-input"
                      (blur)="saveEdit(row)" (keydown.enter)="saveEdit(row)" (keydown.escape)="cancelEdit()" />
                  } @else { {{ row.name }} }
                </td>
                <td class="right cell-presupuesto" (click)="startEdit(row.id, 'presupuestado', row.presupuestado)">
                  @if (editingCell()?.rowId === row.id && editingCell()?.field === 'presupuestado') {
                    <p-inputNumber [(ngModel)]="editNum" mode="currency" currency="EUR" locale="es-ES"
                      styleClass="cell-number" [inputStyle]="{width:'100%'}"
                      (onBlur)="saveEdit(row)" (keydown.enter)="saveEdit(row)" (keydown.escape)="cancelEdit()" />
                  } @else { {{ row.presupuestado | currency:'EUR':'symbol':'1.2-2':'es' }} }
                </td>
                <td class="right" (click)="startEdit(row.id, 'real', row.real)">
                  @if (editingCell()?.rowId === row.id && editingCell()?.field === 'real') {
                    <p-inputNumber [(ngModel)]="editNum" mode="currency" currency="EUR" locale="es-ES"
                      styleClass="cell-number" [inputStyle]="{width:'100%'}"
                      (onBlur)="saveEdit(row)" (keydown.enter)="saveEdit(row)" (keydown.escape)="cancelEdit()" />
                  } @else { {{ row.real | currency:'EUR':'symbol':'1.2-2':'es' }} }
                </td>
                <td [class]="'right diff col-diff ' + diffClass(row.presupuestado - row.real)">
                  {{ (row.presupuestado - row.real) | currency:'EUR':'symbol':'1.2-2':'es' }}
                </td>
                <td class="cell-tipo">
                  <span [class]="'tipo-badge ' + row.tipo" (click)="toggleTipo(row)" style="cursor:pointer">
                    {{ row.tipo === 'fijos' ? 'F' : 'V' }}
                  </span>
                </td>
                <td class="action-cell">
                  <button class="icon-btn delete" (click)="onDelete(row.id)"><i class="pi pi-trash"></i></button>
                </td>
              </tr>
            }
            @if (items.length === 0) {
              <tr><td colspan="6" class="empty-row">Sin gastos registrados.</td></tr>
            }
          </tbody>
          <tfoot>
            <tr class="totals-row">
              <td>TOTAL</td>
              <td class="right cell-presupuesto">{{ totalP() | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td class="right">{{ totalR() | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td [class]="'right diff col-diff ' + diffClass(totalP() - totalR())">{{ (totalP() - totalR()) | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td class="cell-tipo"></td><td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      @if (addingRow()) {
        <div class="add-row-form">
          <input pInputText [(ngModel)]="nData.name" placeholder="Descripción" class="add-input" />
          <p-inputNumber [(ngModel)]="nData.presupuestado" mode="currency" currency="EUR" locale="es-ES" placeholder="Presupuesto" [inputStyle]="{width:'110px'}" />
          <p-selectButton [(ngModel)]="nData.tipo" [options]="tipoOptions" optionLabel="label" optionValue="value" styleClass="tipo-toggle" />
          <button class="icon-btn save" (click)="confirmAdd()"><i class="pi pi-check"></i></button>
          <button class="icon-btn cancel" (click)="addingRow.set(false)"><i class="pi pi-times"></i></button>
        </div>
      } @else {
        <button class="add-btn" (click)="addingRow.set(true)"><i class="pi pi-plus"></i> Añadir gasto</button>
      }
    </div>
  `,
  styles: [`
    .table-wrapper { overflow-x:auto; }
    .budget-tbl { width:100%; border-collapse:collapse; font-size:.85rem; table-layout:fixed;
      th { padding:.5rem .4rem; border-bottom:2px solid var(--kakebo-borde); color:var(--kakebo-texto-secundario); font-size:.73rem; text-transform:uppercase; letter-spacing:.04em; font-weight:600; white-space:nowrap; overflow:hidden; }
      td { padding:.45rem .4rem; border-bottom:1px solid var(--kakebo-borde); vertical-align:middle; overflow:hidden; cursor:pointer; }
      .right { text-align:right; }
      .col-amt-presupuesto { width:84px; }
      .col-diff { width:72px; }
      .col-tipo { width:40px; text-align:center; }
      .col-actions { width:34px; cursor:default; }
      .data-row:hover { background:rgba(30,58,95,.025); }
      .row-editing { background:rgba(30,58,95,.03); }
      .totals-row { font-weight:700; td { border-top:2px solid var(--kakebo-borde); border-bottom:none; } }
    }
    .diff { font-weight:600; }
    .positive { color:var(--kakebo-verde); } .negative { color:var(--kakebo-rojo-soft); } .neutral { color:var(--kakebo-texto-secundario); }
    .empty-row { text-align:center; color:var(--kakebo-texto-secundario); padding:1.5rem; cursor:default; }
    .action-cell { text-align:right; cursor:default; }
    .cell-input { width:100%; font-size:.85rem; padding:.1rem .2rem; }
    :host ::ng-deep .cell-number input { width:100% !important; font-size:.82rem; text-align:right; padding:.1rem .2rem !important; }
    .icon-btn { background:none; border:none; cursor:pointer; padding:.25rem .3rem; border-radius:4px; font-size:.8rem; transition:background .15s;
      &.delete{color:var(--kakebo-rojo-soft);&:hover{background:rgba(231,76,60,.1);}}
      &.save{color:var(--kakebo-verde);&:hover{background:rgba(39,174,96,.1);}}
      &.cancel{color:var(--kakebo-texto-secundario);&:hover{background:rgba(0,0,0,.05);}}
    }
    .tipo-badge { font-size:.65rem; font-weight:700; padding:2px 6px; border-radius:999px; letter-spacing:.05em;
      &.fijos { background:rgba(30,58,95,.1); color:var(--kakebo-indigo); }
      &.variables { background:rgba(197,160,89,.15); color:#8a6d2e; }
    }
    .add-row-form { display:flex; align-items:center; gap:.5rem; padding:.75rem 0 0; flex-wrap:wrap; }
    .add-input { flex:1; min-width:100px; font-size:.85rem; }
    .add-btn { display:flex; align-items:center; gap:.375rem; margin-top:.75rem; background:none; border:1px dashed var(--kakebo-borde); border-radius:8px; padding:.5rem 1rem; color:var(--kakebo-texto-secundario); font-size:.8rem; cursor:pointer; width:100%; justify-content:center; transition:border-color .15s,color .15s; &:hover{border-color:var(--kakebo-indigo);color:var(--kakebo-indigo);} }
    :host ::ng-deep .tipo-toggle .p-selectbutton .p-button { font-size:.7rem; padding:.2rem .5rem; }
    :host ::ng-deep .tipo-toggle .p-selectbutton .p-button.p-highlight { background:var(--kakebo-indigo); border-color:var(--kakebo-indigo); }

    @media (max-width: 767px) {
      .budget-tbl {
        font-size: .78rem;
        th, td { padding: .35rem .25rem; }
        .col-tipo, .cell-tipo { display: none; }
        .col-amt-presupuesto, .cell-presupuesto { display: none; }
        .col-actions { width: 28px; }
        .col-diff { width: 58px; }
      }
    }
  `]
})
export class GastosTableComponent {
  @Input() items: Gasto[] = [];
  @Input() monthId = '';
  @Input() userId = '';
  @Output() changed = new EventEmitter<void>();

  editingCell = signal<{ rowId: string; field: GastoField } | null>(null);
  addingRow = signal(false);

  tipoOptions = [{ label: 'Fijo', value: 'fijos' }, { label: 'Variable', value: 'variables' }];

  editStr = '';
  editNum = 0;
  nData = { name: '', presupuestado: 0, tipo: 'variables' as 'fijos' | 'variables' };

  totalP() { return this.items.reduce((s, g) => s + g.presupuestado, 0); }
  totalR() { return this.items.reduce((s, g) => s + g.real, 0); }
  diffClass(d: number) { return d > 0 ? 'positive' : d < 0 ? 'negative' : 'neutral'; }

  constructor(private service: SectionService) {}

  startEdit(rowId: string, field: GastoField, value: string | number) {
    this.editingCell.set({ rowId, field });
    if (field === 'name') this.editStr = value as string;
    else this.editNum = value as number;
  }

  async saveEdit(row: Gasto) {
    const cell = this.editingCell();
    if (!cell || cell.rowId !== row.id) return;
    const update: Partial<Gasto> = {};
    if (cell.field === 'name') update.name = this.editStr;
    else if (cell.field === 'presupuestado') update.presupuestado = this.editNum;
    else if (cell.field === 'real') update.real = this.editNum;
    this.editingCell.set(null);
    await this.service.gastos.update(row.id, update);
    this.changed.emit();
  }

  cancelEdit() { this.editingCell.set(null); }

  async toggleTipo(row: Gasto) {
    await this.service.gastos.update(row.id, { tipo: row.tipo === 'fijos' ? 'variables' : 'fijos' });
    this.changed.emit();
  }

  async confirmAdd() {
    if (!this.nData.name.trim()) return;
    await this.service.gastos.add({ month_id: this.monthId, user_id: this.userId, name: this.nData.name.trim(), presupuestado: this.nData.presupuestado, real: 0, tipo: this.nData.tipo, order_index: this.items.length });
    this.nData = { name: '', presupuestado: 0, tipo: 'variables' };
    this.addingRow.set(false);
    this.changed.emit();
  }

  async onDelete(id: string) { await this.service.gastos.remove(id); this.changed.emit(); }
}