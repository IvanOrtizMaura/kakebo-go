import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { FacturasService } from '../../../../shared/services/facturas.service';
import { Factura } from '../../../../shared/models';

@Component({
  selector: 'app-facturas-table',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, ButtonModule, InputTextModule, InputNumberModule, CheckboxModule],
  template: `
    <div class="kakebo-card">
      <div class="section-header">
        <div style="display:flex;align-items:center;gap:.5rem">
          <h2>Facturas</h2>
          <i class="pi pi-info-circle" style="color:var(--kakebo-texto-secundario);font-size:.85rem"
             title="Gastos fijos innegociables: alquiler, hipoteca, parking, teléfono... Los marcados como recurrentes se copian al mes siguiente."></i>
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
              <th class="right">Presupuesto</th>
              <th class="right">Real</th>
              <th class="right">Dif.</th>
              <th class="center">Recurrente</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (row of sortedItems; track row.id) {
              @if (editingId() === row.id) {
                <tr class="editing-row">
                  <td><input pInputText [(ngModel)]="eData.name" class="edit-input" /></td>
                  <td><p-inputNumber [(ngModel)]="eData.presupuestado" mode="currency" currency="EUR" locale="es-ES" [inputStyle]="{width:'90px'}" /></td>
                  <td><p-inputNumber [(ngModel)]="eData.real" mode="currency" currency="EUR" locale="es-ES" [inputStyle]="{width:'90px'}" /></td>
                  <td [class]="'right ' + diffClass(eData.presupuestado - eData.real)">
                    {{ (eData.presupuestado - eData.real) | currency:'EUR':'symbol':'1.2-2':'es' }}
                  </td>
                  <td class="center"><p-checkbox [(ngModel)]="eData.is_recurring" [binary]="true" /></td>
                  <td class="action-cell">
                    <button class="icon-btn save" (click)="saveEdit(row.id)"><i class="pi pi-check"></i></button>
                    <button class="icon-btn cancel" (click)="cancelEdit()"><i class="pi pi-times"></i></button>
                  </td>
                </tr>
              } @else {
                <tr class="data-row">
                  <td>{{ row.name }}</td>
                  <td class="right">{{ row.presupuestado | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
                  <td class="right">{{ row.real | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
                  <td [class]="'right diff ' + diffClass(row.presupuestado - row.real)">
                    {{ (row.presupuestado - row.real) | currency:'EUR':'symbol':'1.2-2':'es' }}
                  </td>
                  <td class="center">
                    <i [class]="row.is_recurring ? 'pi pi-refresh' : 'pi pi-circle'"
                       [style.color]="row.is_recurring ? 'var(--kakebo-dorado)' : 'var(--kakebo-borde)'"></i>
                  </td>
                  <td class="action-cell">
                    <button class="icon-btn edit" (click)="startEdit(row)"><i class="pi pi-pencil"></i></button>
                    <button class="icon-btn delete" (click)="onDelete(row.id)"><i class="pi pi-trash"></i></button>
                  </td>
                </tr>
              }
            }
            @if (items.length === 0) {
              <tr><td colspan="6" class="empty-row">Sin facturas. Las facturas recurrentes se copian del mes anterior.</td></tr>
            }
          </tbody>
          <tfoot>
            <tr class="totals-row">
              <td>TOTAL</td>
              <td class="right">{{ totalP() | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td class="right">{{ totalR() | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td [class]="'right diff ' + diffClass(totalP() - totalR())">{{ (totalP() - totalR()) | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td></td><td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      @if (addingRow()) {
        <div class="add-row-form">
          <input pInputText [(ngModel)]="nData.name" placeholder="Descripción" class="add-input" />
          <p-inputNumber [(ngModel)]="nData.presupuestado" mode="currency" currency="EUR" locale="es-ES" placeholder="Presupuesto" [inputStyle]="{width:'110px'}" />
          <button class="icon-btn save" (click)="confirmAdd()"><i class="pi pi-check"></i></button>
          <button class="icon-btn cancel" (click)="addingRow.set(false)"><i class="pi pi-times"></i></button>
        </div>
      } @else {
        <button class="add-btn" (click)="addingRow.set(true)"><i class="pi pi-plus"></i> Añadir factura</button>
      }
    </div>
  `,
  styles: [`
    .table-wrapper { overflow-x: auto; }
    .budget-tbl { width:100%; border-collapse:collapse; font-size:.85rem;
      th { padding:.5rem; border-bottom:2px solid var(--kakebo-borde); color:var(--kakebo-texto-secundario); font-size:.73rem; text-transform:uppercase; letter-spacing:.04em; font-weight:600; white-space:nowrap; }
      td { padding:.5rem; border-bottom:1px solid var(--kakebo-borde); vertical-align:middle; }
      .right { text-align:right; } .center { text-align:center; }
      .data-row:hover { background:rgba(30,58,95,.025); }
      .totals-row { font-weight:700; td { border-top:2px solid var(--kakebo-borde); border-bottom:none; } }
    }
    .diff { font-weight:600; }
    .positive { color:var(--kakebo-verde); } .negative { color:var(--kakebo-rojo-soft); } .neutral { color:var(--kakebo-texto-secundario); }
    .empty-row { text-align:center; color:var(--kakebo-texto-secundario); padding:1.5rem; }
    .editing-row td { background:rgba(30,58,95,.03); }
    .edit-input { width:100%; font-size:.85rem; }
    .action-cell { text-align:right; white-space:nowrap; }
    .icon-btn { background:none; border:none; cursor:pointer; padding:.25rem .3rem; border-radius:4px; font-size:.8rem; transition:background .15s;
      &.edit{color:var(--kakebo-indigo);&:hover{background:rgba(30,58,95,.1);}}
      &.delete{color:var(--kakebo-rojo-soft);&:hover{background:rgba(231,76,60,.1);}}
      &.save{color:var(--kakebo-verde);&:hover{background:rgba(39,174,96,.1);}}
      &.cancel{color:var(--kakebo-texto-secundario);&:hover{background:rgba(0,0,0,.05);}}
    }
    .add-row-form { display:flex; align-items:center; gap:.5rem; padding:.75rem 0 0; flex-wrap:wrap; }
    .add-input { flex:1; min-width:100px; font-size:.85rem; }
    .add-btn { display:flex; align-items:center; gap:.375rem; margin-top:.75rem; background:none; border:1px dashed var(--kakebo-borde); border-radius:8px; padding:.5rem 1rem; color:var(--kakebo-texto-secundario); font-size:.8rem; cursor:pointer; width:100%; justify-content:center; transition:border-color .15s,color .15s; &:hover{border-color:var(--kakebo-indigo);color:var(--kakebo-indigo);} }
  `]
})
export class FacturasTableComponent {
  @Input() items: Factura[] = [];
  @Input() monthId = '';
  @Input() userId = '';
  @Output() changed = new EventEmitter<void>();

  editingId = signal<string | null>(null);
  addingRow = signal(false);

  eData = { name: '', presupuestado: 0, real: 0, is_recurring: true };
  nData = { name: '', presupuestado: 0 };

  totalP() { return this.items.reduce((s, f) => s + f.presupuestado, 0); }
  totalR() { return this.items.reduce((s, f) => s + f.real, 0); }
  diffClass(d: number) { return d > 0 ? 'positive' : d < 0 ? 'negative' : 'neutral'; }

  get sortedItems(): Factura[] {
    return [...this.items].sort((a, b) => b.presupuestado - a.presupuestado);
  }

  constructor(private service: FacturasService) {}

  startEdit(row: Factura) {
    this.editingId.set(row.id);
    this.eData = { name: row.name, presupuestado: row.presupuestado, real: row.real, is_recurring: row.is_recurring };
  }

  async saveEdit(id: string) {
    await this.service.update(id, { name: this.eData.name, presupuestado: this.eData.presupuestado, real: this.eData.real, is_recurring: this.eData.is_recurring });
    this.editingId.set(null);
    this.changed.emit();
  }

  cancelEdit() { this.editingId.set(null); }

  async confirmAdd() {
    if (!this.nData.name.trim()) return;
    await this.service.add({ month_id: this.monthId, user_id: this.userId, name: this.nData.name.trim(), fecha: null, presupuestado: this.nData.presupuestado, real: 0, is_recurring: true, order_index: this.items.length });
    this.nData = { name: '', presupuestado: 0 };
    this.addingRow.set(false);
    this.changed.emit();
  }

  async onDelete(id: string) { await this.service.remove(id); this.changed.emit(); }
}
