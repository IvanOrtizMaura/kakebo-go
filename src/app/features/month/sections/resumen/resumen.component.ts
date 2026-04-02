import { Component, Input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';

interface SectionTotals { presupuestado: number; real: number; }

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [CurrencyPipe],
  template: `
    <div class="kakebo-card resumen-card">
      <div class="section-header">
        <h2>Resumen de Presupuesto</h2>
      </div>

      <div class="table-wrapper">
        <table class="resumen-tbl">
          <thead>
            <tr>
              <th>Categoría</th>
              <th class="right">Presupuestado</th>
              <th class="right">Real</th>
              <th class="right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            <tr class="row-ingresos">
              <td><i class="pi pi-arrow-up-right"></i> Ingresos</td>
              <td class="right">{{ ingresosTotals.presupuestado | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td class="right">{{ ingresosTotals.real | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td class="right">—</td>
            </tr>
            <tr>
              <td><i class="pi pi-file"></i> Facturas</td>
              <td class="right">{{ facturasTotals.presupuestado | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td class="right">{{ facturasTotals.real | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td [class]="'right diff ' + diffClass(facturasTotals.presupuestado - facturasTotals.real)">
                {{ (facturasTotals.presupuestado - facturasTotals.real) | currency:'EUR':'symbol':'1.2-2':'es' }}
              </td>
            </tr>
            <tr>
              <td><i class="pi pi-shopping-cart"></i> Gastos</td>
              <td class="right">{{ gastosTotals.presupuestado | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td class="right">{{ gastosTotals.real | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td [class]="'right diff ' + diffClass(gastosTotals.presupuestado - gastosTotals.real)">
                {{ (gastosTotals.presupuestado - gastosTotals.real) | currency:'EUR':'symbol':'1.2-2':'es' }}
              </td>
            </tr>
            <tr>
              <td><i class="pi pi-wallet"></i> Ahorros</td>
              <td class="right">{{ ahorrosTotals.presupuestado | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td class="right">{{ ahorrosTotals.real | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td [class]="'right diff ' + diffClass(ahorrosTotals.presupuestado - ahorrosTotals.real)">
                {{ (ahorrosTotals.presupuestado - ahorrosTotals.real) | currency:'EUR':'symbol':'1.2-2':'es' }}
              </td>
            </tr>
            <tr>
              <td><i class="pi pi-box"></i> Fondos Ahorro</td>
              <td class="right">{{ fondosTotals.presupuestado | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td class="right">{{ fondosTotals.real | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td [class]="'right diff ' + diffClass(fondosTotals.presupuestado - fondosTotals.real)">
                {{ (fondosTotals.presupuestado - fondosTotals.real) | currency:'EUR':'symbol':'1.2-2':'es' }}
              </td>
            </tr>
            @if (parejaTotals) {
              <tr>
                <td><i class="pi pi-users"></i> Pareja</td>
                <td class="right">{{ parejaTotals.presupuestado | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
                <td class="right">{{ parejaTotals.real | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
                <td [class]="'right diff ' + diffClass(parejaTotals.presupuestado - parejaTotals.real)">
                  {{ (parejaTotals.presupuestado - parejaTotals.real) | currency:'EUR':'symbol':'1.2-2':'es' }}
                </td>
              </tr>
            }
            <tr>
              <td><i class="pi pi-credit-card"></i> Deudas</td>
              <td class="right">{{ deudasTotals.presupuestado | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td class="right">{{ deudasTotals.real | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td [class]="'right diff ' + diffClass(deudasTotals.presupuestado - deudasTotals.real)">
                {{ (deudasTotals.presupuestado - deudasTotals.real) | currency:'EUR':'symbol':'1.2-2':'es' }}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="totals-row">
              <td>TOTAL GASTOS</td>
              <td class="right">{{ totalGastosP() | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td class="right">{{ totalGastosR() | currency:'EUR':'symbol':'1.2-2':'es' }}</td>
              <td></td>
            </tr>
            <tr class="restante-row">
              <td>CANTIDAD RESTANTE</td>
              <td [class]="'right bold ' + diffClass(ingresosTotals.presupuestado - totalGastosP())">
                {{ (ingresosTotals.presupuestado - totalGastosP()) | currency:'EUR':'symbol':'1.2-2':'es' }}
              </td>
              <td [class]="'right bold ' + diffClass(ingresosTotals.real - totalGastosR())">
                {{ (ingresosTotals.real - totalGastosR()) | currency:'EUR':'symbol':'1.2-2':'es' }}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .resumen-card { margin-bottom: 1.25rem; }
    .table-wrapper { overflow-x: auto; }
    .resumen-tbl {
      width: 100%; border-collapse: collapse; font-size: .85rem;
      th { padding: .5rem; border-bottom: 2px solid var(--kakebo-borde); color: var(--kakebo-texto-secundario); font-size: .73rem; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
      td { padding: .55rem .5rem; border-bottom: 1px solid var(--kakebo-borde); vertical-align: middle; }
      td:first-child { display: flex; align-items: center; gap: .4rem; color: var(--kakebo-texto-principal); .pi{font-size:.8rem;color:var(--kakebo-texto-secundario);} }
      .right { text-align: right; }
    }
    .row-ingresos td { color: var(--kakebo-verde) !important; font-weight: 600; }
    .diff { font-weight: 600; }
    .positive { color: var(--kakebo-verde); }
    .negative { color: var(--kakebo-rojo-soft); }
    .neutral { color: var(--kakebo-texto-secundario); }
    .totals-row td { font-weight: 700; border-top: 2px solid var(--kakebo-borde); border-bottom: none; color: var(--kakebo-indigo); }
    .restante-row td { font-weight: 700; font-size: .9rem; border-bottom: none; background: rgba(30,58,95,.03); }
    .bold { font-weight: 700; font-size: .9rem; }
  `]
})
export class ResumenComponent {
  @Input() ingresosTotals: SectionTotals = { presupuestado: 0, real: 0 };
  @Input() facturasTotals: SectionTotals = { presupuestado: 0, real: 0 };
  @Input() gastosTotals: SectionTotals = { presupuestado: 0, real: 0 };
  @Input() ahorrosTotals: SectionTotals = { presupuestado: 0, real: 0 };
  @Input() fondosTotals: SectionTotals = { presupuestado: 0, real: 0 };
  @Input() parejaTotals: SectionTotals | null = null;
  @Input() deudasTotals: SectionTotals = { presupuestado: 0, real: 0 };

  totalGastosP() {
    return this.facturasTotals.presupuestado + this.gastosTotals.presupuestado +
      this.ahorrosTotals.presupuestado + this.fondosTotals.presupuestado +
      (this.parejaTotals?.presupuestado ?? 0) + this.deudasTotals.presupuestado;
  }

  totalGastosR() {
    return this.facturasTotals.real + this.gastosTotals.real +
      this.ahorrosTotals.real + this.fondosTotals.real +
      (this.parejaTotals?.real ?? 0) + this.deudasTotals.real;
  }

  diffClass(d: number) { return d > 0 ? 'positive' : d < 0 ? 'negative' : 'neutral'; }
}
