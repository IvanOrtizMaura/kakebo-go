import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TooltipModule } from 'primeng/tooltip';

export interface BudgetRow {
  id: string;
  name: string;
  presupuestado: number;
  real: number;
  [key: string]: unknown;
}

@Component({
  selector: 'app-budget-table',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, ButtonModule, InputTextModule, InputNumberModule, TooltipModule],
  template: `
    <div class="kakebo-card budget-table">
      <div class="section-header">
        <div class="header-left">
          <h2>{{ title }}</h2>
          @if (tooltip) {
            <i class="pi pi-info-circle tooltip-icon"
               [pTooltip]="tooltip" tooltipPosition="right"></i>
          }
        </div>
        <div class="header-totals">
          <span class="total-label">Total:</span>
          <span class="total-value presupuestado">{{ totalPresupuestado() | currency:'EUR':'symbol':'1.2-2':'es' }}</span>
          <span class="total-sep">/</span>
          <span class="total-value real">{{ totalReal() | currency:'EUR':'symbol':'1.2-2':'es' }}</span>
        </div>
      </div>

      <div class="table-wrapper">
        <table class="budget-tbl">
          <thead>
            <tr>
              <th class="col-name">Concepto</th>
              <th class="col-amt col-amt-presupuesto">Presupuesto</th>
              <th class="col-amt">Real</th>
              <th class="col-diff">Dif.</th>
              <th class="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            @for (row of sortedItems; track row.id) {
              <tr class="data-row" [class.row-editing]="editingCell()?.rowId === row.id">
                <td class="name-cell" (click)="startCellEdit(row.id, 'name', row.name)">
                  @if (editingCell()?.rowId === row.id && editingCell()?.field === 'name') {
                    <input pInputText [(ngModel)]="editStrValue" class="cell-input"
                      (blur)="saveCellEdit(row)"
                      (keydown.enter)="saveCellEdit(row)"
                      (keydown.escape)="cancelCellEdit()" />
                  } @else {
                    {{ row.name }}
                  }
                </td>
                <td class="amt-cell cell-presupuesto" (click)="startCellEdit(row.id, 'presupuestado', row.presupuestado)">
                  @if (editingCell()?.rowId === row.id && editingCell()?.field === 'presupuestado') {
                    <p-inputNumber [(ngModel)]="editNumValue" mode="currency" currency="EUR" locale="es-ES"
                      styleClass="cell-number" [inputStyle]="{width:'100%'}"
                      (onBlur)="saveCellEdit(row)"
                      (keydown.enter)="saveCellEdit(row)"
                      (keydown.escape)="cancelCellEdit()" />
                  } @else {
                    {{ row.presupuestado | currency:'EUR':'symbol':'1.2-2':'es' }}
                  }
                </td>
                <td class="amt-cell" (click)="startCellEdit(row.id, 'real', row.real)">
                  @if (editingCell()?.rowId === row.id && editingCell()?.field === 'real') {
                    <p-inputNumber [(ngModel)]="editNumValue" mode="currency" currency="EUR" locale="es-ES"
                      styleClass="cell-number" [inputStyle]="{width:'100%'}"
                      (onBlur)="saveCellEdit(row)"
                      (keydown.enter)="saveCellEdit(row)"
                      (keydown.escape)="cancelCellEdit()" />
                  } @else {
                    {{ row.real | currency:'EUR':'symbol':'1.2-2':'es' }}
                  }
                </td>
                <td [class]="'diff-cell ' + diffClass(row.presupuestado - row.real)">
                  {{ (row.presupuestado - row.real) | currency:'EUR':'symbol':'1.2-2':'es' }}
                </td>
                <td class="action-cell">
                  <button class="icon-btn delete" (click)="onDelete(row.id)"><i class="pi pi-trash"></i></button>
                </td>
              </tr>
            }
            @if (items.length === 0) {
              <tr><td colspan="5" class="empty-row">Sin registros. Añade uno abajo.</td></tr>
            }
          </tbody>
          <tfoot>
            <tr class="totals-row">
              <td class="total-label-cell">TOTAL</td>
              <td class="amt-cell cell-presupuesto">{{ totalPresupuestado() | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td class="amt-cell">{{ totalReal() | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td [class]="'diff-cell ' + diffClass(totalPresupuestado() - totalReal())">
                {{ (totalPresupuestado() - totalReal()) | currency:'EUR':'symbol':'1.2-2':'es' }}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      @if (addingRow()) {
        <div class="add-row-form">
          <input pInputText [(ngModel)]="newName" placeholder="Concepto" class="add-input-name" />
          <p-inputNumber [(ngModel)]="newPresupuestado" mode="currency" currency="EUR" locale="es-ES"
            placeholder="Presupuesto" styleClass="add-number" />
          <button class="icon-btn save" (click)="confirmAdd()"><i class="pi pi-check"></i></button>
          <button class="icon-btn cancel" (click)="addingRow.set(false)"><i class="pi pi-times"></i></button>
        </div>
      } @else {
        <button class="add-btn" (click)="addingRow.set(true)">
          <i class="pi pi-plus"></i> Añadir
        </button>
      }
    </div>
  `,
  styles: [`
    .budget-table {
      .section-header {
        display: flex; align-items: center; justify-content: space-between;
        flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;
      }
      .header-left { display: flex; align-items: center; gap: 0.5rem; }
      .tooltip-icon { color: var(--kakebo-texto-secundario); font-size: 0.85rem; cursor: help; }
      .header-totals { display: flex; align-items: center; gap: 0.375rem; font-size: 0.8rem; }
      .total-label { color: var(--kakebo-texto-secundario); }
      .total-value { font-weight: 600; }
      .total-value.presupuestado { color: var(--kakebo-indigo); }
      .total-value.real { color: var(--kakebo-texto-principal); }
      .total-sep { color: var(--kakebo-texto-secundario); }
    }

    .table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }

    .budget-tbl {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      table-layout: fixed;

      th {
        text-align: left;
        padding: 0.5rem 0.4rem;
        border-bottom: 2px solid var(--kakebo-borde);
        color: var(--kakebo-texto-secundario);
        font-weight: 600; font-size: 0.75rem;
        text-transform: uppercase; letter-spacing: 0.04em;
        white-space: nowrap; overflow: hidden;
      }

      td {
        padding: 0.45rem 0.4rem;
        border-bottom: 1px solid var(--kakebo-borde);
        vertical-align: middle; overflow: hidden;
      }

      .col-name { width: auto; }
      .col-amt { width: 84px; text-align: right; }
      .col-diff { width: 72px; text-align: right; }
      .col-actions { width: 34px; }

      .amt-cell { text-align: right; cursor: pointer; }
      .diff-cell { text-align: right; font-weight: 600; }
      .name-cell { cursor: pointer; color: var(--kakebo-texto-principal); }

      .totals-row {
        font-weight: 700;
        .total-label-cell { color: var(--kakebo-indigo); font-size: 0.75rem; text-transform: uppercase; }
        td { border-top: 2px solid var(--kakebo-borde); border-bottom: none; }
      }

      .empty-row { text-align: center; color: var(--kakebo-texto-secundario); font-size: 0.85rem; padding: 1.5rem; }
      .data-row:hover { background: rgba(30,58,95,0.025); }
      .row-editing { background: rgba(30,58,95,0.03); }
    }

    @media (max-width: 767px) {
      .budget-tbl {
        font-size: 0.78rem;
        th, td { padding: 0.35rem 0.25rem; }
        .col-amt { width: 68px; }
        .col-diff { width: 58px; }
        .col-actions { width: 28px; }
        .col-amt-presupuesto { display: none; }
        .cell-presupuesto { display: none; }
      }
    }

    .action-cell { text-align: right; }

    .icon-btn {
      background: none; border: none; cursor: pointer;
      padding: 0.25rem 0.3rem; border-radius: 4px;
      font-size: 0.8rem; transition: background 0.15s;
      &.delete { color: var(--kakebo-rojo-soft); &:hover { background: rgba(231,76,60,0.1); } }
      &.save { color: var(--kakebo-verde); &:hover { background: rgba(39,174,96,0.1); } }
      &.cancel { color: var(--kakebo-texto-secundario); &:hover { background: rgba(0,0,0,0.05); } }
    }

    .positive { color: var(--kakebo-verde); }
    .negative { color: var(--kakebo-rojo-soft); }
    .neutral { color: var(--kakebo-texto-secundario); }

    .cell-input { width: 100%; font-size: 0.85rem; padding: 0.1rem 0.2rem; }
    :host ::ng-deep .cell-number input { width: 100% !important; font-size: 0.82rem; text-align: right; padding: 0.1rem 0.2rem !important; }

    .add-row-form { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 0 0; flex-wrap: wrap; }
    .add-input-name { flex: 1; min-width: 120px; font-size: 0.85rem; }
    :host ::ng-deep .add-number input { width: 120px !important; font-size: 0.85rem; }

    .add-btn {
      display: flex; align-items: center; gap: 0.375rem;
      margin-top: 0.75rem; background: none;
      border: 1px dashed var(--kakebo-borde); border-radius: 8px;
      padding: 0.5rem 1rem; color: var(--kakebo-texto-secundario);
      font-size: 0.8rem; cursor: pointer; width: 100%; justify-content: center;
      transition: border-color 0.15s, color 0.15s;
      &:hover { border-color: var(--kakebo-indigo); color: var(--kakebo-indigo); }
    }
  `]
})
export class BudgetTableComponent {
  @Input() title = '';
  @Input() tooltip = '';
  @Input() items: BudgetRow[] = [];
  @Output() itemAdded = new EventEmitter<{ name: string; presupuestado: number }>();
  @Output() itemUpdated = new EventEmitter<{ id: string; name: string; presupuestado: number; real: number }>();
  @Output() itemDeleted = new EventEmitter<string>();

  editingCell = signal<{ rowId: string; field: 'name' | 'presupuestado' | 'real' } | null>(null);
  editStrValue = '';
  editNumValue = 0;

  addingRow = signal(false);
  newName = '';
  newPresupuestado = 0;

  get sortedItems(): BudgetRow[] {
    return [...this.items].sort((a, b) => b.presupuestado - a.presupuestado);
  }

  totalPresupuestado() { return this.items.reduce((s, r) => s + (r.presupuestado ?? 0), 0); }
  totalReal() { return this.items.reduce((s, r) => s + (r.real ?? 0), 0); }

  diffClass(diff: number): string {
    if (diff > 0) return 'positive';
    if (diff < 0) return 'negative';
    return 'neutral';
  }

  startCellEdit(rowId: string, field: 'name' | 'presupuestado' | 'real', value: string | number) {
    this.editingCell.set({ rowId, field });
    if (field === 'name') {
      this.editStrValue = value as string;
    } else {
      this.editNumValue = value as number;
    }
  }

  saveCellEdit(row: BudgetRow) {
    const cell = this.editingCell();
    if (!cell || cell.rowId !== row.id) return;
    this.itemUpdated.emit({
      id: row.id,
      name: cell.field === 'name' ? this.editStrValue : row.name,
      presupuestado: cell.field === 'presupuestado' ? this.editNumValue : row.presupuestado,
      real: cell.field === 'real' ? this.editNumValue : row.real,
    });
    this.editingCell.set(null);
  }

  cancelCellEdit() { this.editingCell.set(null); }

  confirmAdd() {
    if (!this.newName.trim()) return;
    this.itemAdded.emit({ name: this.newName.trim(), presupuestado: this.newPresupuestado });
    this.newName = '';
    this.newPresupuestado = 0;
    this.addingRow.set(false);
  }

  onDelete(id: string) { this.itemDeleted.emit(id); }
}