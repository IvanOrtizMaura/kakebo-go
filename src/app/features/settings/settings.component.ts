import { Component, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { UserProfileService } from '../../core/auth/user-profile.service';
import { IngresoTemplatesService, IngresoTemplate } from '../../shared/services/ingreso-templates.service';
import { DeudasService } from '../../shared/services/deudas.service';
import { AhorroTemplatesService } from '../../shared/services/ahorro-templates.service';
import { Deuda, AhorroTemplate, UserProfile } from '../../shared/models';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, CurrencyPipe],
  template: `
    <div class="settings-page">
      <h1 class="page-title">Configuración</h1>

      <!-- ── Ingresos Fijos ─────────────────────────────────────── -->
      <section class="settings-section">
        <div class="section-header">
          <h2 class="section-title">Ingresos Fijos</h2>
          <p class="section-desc">Configura tus fuentes de ingreso recurrentes. Se copiarán automáticamente al abrir cada mes nuevo.</p>
        </div>

        <div class="items-list">
          @for (t of templates(); track t.id) {
            <div class="list-item">
              @if (editingTemplateId() === t.id) {
                <div class="edit-row">
                  <input class="inp" [(ngModel)]="editTplFuente" placeholder="Fuente" />
                  <input class="inp w-sm" type="number" [(ngModel)]="editTplEsperado" placeholder="Importe €" min="0" />
                  <button class="btn-save" (click)="saveTemplate(t.id)">Guardar</button>
                  <button class="btn-cancel" (click)="cancelEditTemplate()">✕</button>
                </div>
              } @else {
                <div class="item-info">
                  <span class="item-name">{{ t.fuente }}</span>
                  <span class="item-meta">
                    {{ t.esperado | currency:'EUR':'symbol':'1.0-0':'es' }}
                  </span>
                </div>
                <div class="item-actions">
                  <button class="btn-icon" title="Editar" (click)="startEditTemplate(t)">
                    <i class="pi pi-pencil"></i>
                  </button>
                  <button class="btn-icon danger" title="Eliminar" (click)="removeTemplate(t.id)">
                    <i class="pi pi-trash"></i>
                  </button>
                </div>
              }
            </div>
          }
          @if (templates().length === 0) {
            <p class="empty-hint">Sin ingresos fijos. Añade uno abajo.</p>
          }
        </div>

        <div class="add-form">
          <h3 class="add-title">Nuevo ingreso fijo</h3>
          <div class="form-row">
            <input class="inp" [(ngModel)]="newTplFuente" placeholder="Fuente (ej: Nómina)" />
            <input class="inp w-sm" type="number" [(ngModel)]="newTplEsperado" placeholder="Importe esperado €" min="0" />
            <button class="btn-add" (click)="addTemplate()" [disabled]="!newTplFuente.trim()">
              <i class="pi pi-plus"></i> Añadir
            </button>
          </div>
        </div>
      </section>

      <!-- ── Deudas ─────────────────────────────────────────────── -->
      <section class="settings-section">
        <div class="section-header">
          <h2 class="section-title">Deudas</h2>
          <p class="section-desc">Configura todas tus deudas. Se mostrarán automáticamente en todos los meses.</p>
        </div>

        <!-- Active debts list -->
        <div class="items-list">
          @for (d of deudas(); track d.id) {
            <div class="list-item deuda-list-item">
              @if (editingDeudaId() === d.id) {
                <div class="edit-row">
                  <input class="inp" [(ngModel)]="editDeudaNombre" placeholder="Nombre" />
                  <input class="inp w-sm" type="number" [(ngModel)]="editDeudaCuota" placeholder="Cuota mensual €" min="0" step="0.01" />
                  <input class="inp w-xs" type="number" [(ngModel)]="editDeudaMeses" placeholder="Nº meses" min="1" title="Dejar vacío = indefinida" />
                  <button class="btn-save" (click)="saveDeuda(d.id)">Guardar</button>
                  <button class="btn-cancel" (click)="cancelEditDeuda()">✕</button>
                </div>
              } @else {
                <div class="item-info">
                  <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
                    <span class="item-name">{{ d.name }}</span>
                    <span class="badge" [class.badge-bank]="d.type==='bank'" [class.badge-savings]="d.type==='savings'">
                      {{ d.type === 'bank' ? 'Banco' : 'Ahorros' }}
                    </span>
                    @if (d.interest_rate > 0) {
                      <span class="badge badge-interest">{{ d.interest_rate }}% TIN</span>
                    }
                  </div>
                  <span class="item-meta">
                    Capital: {{ d.principal_amount | currency:'EUR':'symbol':'1.2-2':'es' }}
                    · Total: {{ d.total_amount | currency:'EUR':'symbol':'1.2-2':'es' }}
                    · Cuota: {{ d.monthly_payment | currency:'EUR':'symbol':'1.2-2':'es' }}/mes
                    @if (d.num_months) { · {{ d.num_months }} meses }
                    @else { · Indefinida }
                    @if (d.start_year && d.start_month) {
                      · Inicio: {{ meses[d.start_month - 1] }} {{ d.start_year }}
                    }
                  </span>
                  <div class="deuda-remaining-bar">
                    <div class="remaining-fill" [style.width.%]="deudaProgress(d)"></div>
                  </div>
                  <span class="item-meta">Pendiente: {{ d.amount_remaining | currency:'EUR':'symbol':'1.2-2':'es' }}</span>
                </div>
                <div class="item-actions">
                  <button class="btn-icon" title="Editar" (click)="startEditDeuda(d)">
                    <i class="pi pi-pencil"></i>
                  </button>
                  <button class="btn-icon danger" title="Archivar" (click)="archiveDeuda(d.id)">
                    <i class="pi pi-archive"></i>
                  </button>
                </div>
              }
            </div>
          }
          @if (deudas().length === 0) {
            <p class="empty-hint">Sin deudas activas. Añade una abajo.</p>
          }
        </div>

        <!-- Archived debts toggle -->
        <div style="padding:.5rem 1.5rem;border-top:1px solid var(--kakebo-borde)">
          <button class="btn-link" (click)="toggleDeudasArchivadas()">
            <i class="pi pi-archive"></i>
            {{ showDeudasArchivadas() ? 'Ocultar archivadas' : 'Ver deudas archivadas (' + deudasArchivadas().length + ')' }}
          </button>
        </div>
        @if (showDeudasArchivadas()) {
          <div class="items-list">
            @for (d of deudasArchivadas(); track d.id) {
              <div class="list-item" style="opacity:.55">
                <div class="item-info">
                  <span class="item-name">{{ d.name }} <span style="color:var(--kakebo-verde);font-size:.75rem">✓ Pagada</span></span>
                  <span class="item-meta">{{ d.total_amount | currency:'EUR':'symbol':'1.2-2':'es' }}</span>
                </div>
              </div>
            }
            @if (deudasArchivadas().length === 0) {
              <p class="empty-hint">Sin deudas archivadas.</p>
            }
          </div>
        }

        <!-- Add form -->
        <div class="add-form">
          <h3 class="add-title">Nueva deuda</h3>
          <div class="form-grid">
            <div class="form-field">
              <label>Nombre</label>
              <input class="inp" [(ngModel)]="newDeudaNombre" placeholder="Ej: Préstamo coche" />
            </div>
            <div class="form-field">
              <label>Tipo</label>
              <select class="inp" [ngModel]="newDeudaTipo" (ngModelChange)="newDeudaTipo=$event; recalcCuota()">
                <option value="bank">Préstamo banco</option>
                <option value="savings">De mis ahorros</option>
              </select>
            </div>
            <div class="form-field">
              <label>Capital prestado (€)</label>
              <input class="inp" type="number"
                [ngModel]="newDeudaCapital" (ngModelChange)="newDeudaCapital=$event; recalcCuota()"
                placeholder="0.00" min="0" step="0.01" />
            </div>
            <div class="form-field">
              <label>TIN anual (%)</label>
              @if (newDeudaTipo === 'savings') {
                <div class="penalty-box">
                  <span class="penalty-rate">5%</span>
                  <span class="penalty-label">⚠️ Castigo por usar ahorros (fijo)</span>
                </div>
              } @else {
                <input class="inp" type="number"
                  [ngModel]="newDeudaInteres" (ngModelChange)="newDeudaInteres=$event; recalcCuota()"
                  placeholder="Ej: 5.5" min="0" step="0.01" />
              }
            </div>
            <div class="form-field">
              <label>Nº de meses <span class="field-hint">(vacío = indefinida)</span></label>
              <input class="inp" type="number"
                [ngModel]="newDeudaMeses" (ngModelChange)="newDeudaMeses=$event; recalcCuota()"
                placeholder="Ej: 60" min="1" step="1" />
            </div>
            <div class="form-field">
              <label>Cuota mensual (€) <span class="field-hint">edita si no coincide</span></label>
              <input class="inp" type="number" [(ngModel)]="newDeudaCuotaFinal" placeholder="0.00" min="0" step="0.01" />
            </div>
            @if (newDeudaMeses) {
              <div class="form-field" style="grid-column:1/-1">
                <label>Mes de inicio</label>
                <div style="display:flex;gap:.4rem">
                  <select class="inp" [(ngModel)]="newDeudaStartMonth" style="flex:1">
                    @for (m of meses; track $index) {
                      <option [value]="$index + 1">{{ m }}</option>
                    }
                  </select>
                  <input class="inp" type="number" [(ngModel)]="newDeudaStartYear" style="flex:0 0 80px;min-width:70px" placeholder="Año" />
                </div>
              </div>
            }
          </div>
          <!-- Calculated preview -->
          @if (newDeudaCapital > 0 && newDeudaCuotaFinal > 0) {
            <div class="calc-preview">
              <span>Total estimado: <strong>{{ (newDeudaMeses ? newDeudaCuotaFinal * newDeudaMeses : newDeudaCapital) | currency:'EUR':'symbol':'1.2-2':'es' }}</strong></span>
              <span>Cuota registrada: <strong>{{ newDeudaCuotaFinal | currency:'EUR':'symbol':'1.2-2':'es' }}/mes</strong></span>
            </div>
          }
          <div style="margin-top:.75rem">
            <button class="btn-add" (click)="addDeuda()" [disabled]="!newDeudaNombre.trim() || newDeudaCapital <= 0">
              <i class="pi pi-plus"></i> Añadir deuda
            </button>
          </div>
        </div>
      </section>

      <!-- ── Ahorros ─────────────────────────────────────────────── -->
      <section class="settings-section">
        <div class="section-header">
          <h2 class="section-title">Ahorros</h2>
          <p class="section-desc">Configura tus categorías de ahorro. Se copiarán automáticamente al abrir cada mes nuevo.</p>
        </div>

        <div class="items-list">
          @for (a of ahorroTemplates(); track a.id) {
            <div class="list-item">
              @if (editingAhorroId() === a.id) {
                <div class="edit-row">
                  <input class="inp" [(ngModel)]="editAhorroNombre" placeholder="Nombre" />
                  <input class="inp w-sm" type="number" [(ngModel)]="editAhorroPresupuestado" placeholder="Presupuesto €" min="0" step="0.01" />
                  <button class="btn-save" (click)="saveAhorroTemplate(a.id)">Guardar</button>
                  <button class="btn-cancel" (click)="cancelEditAhorro()">✕</button>
                </div>
              } @else {
                <div class="item-info">
                  <span class="item-name">{{ a.name }}</span>
                  <span class="item-meta">{{ a.presupuestado | currency:'EUR':'symbol':'1.0-0':'es' }}/mes</span>
                </div>
                <div class="item-actions">
                  <button class="btn-icon" title="Editar" (click)="startEditAhorro(a)">
                    <i class="pi pi-pencil"></i>
                  </button>
                  <button class="btn-icon danger" title="Eliminar" (click)="removeAhorroTemplate(a.id)">
                    <i class="pi pi-trash"></i>
                  </button>
                </div>
              }
            </div>
          }
          @if (ahorroTemplates().length === 0) {
            <p class="empty-hint">Sin categorías de ahorro. Añade una abajo.</p>
          }
        </div>

        <div class="add-form">
          <h3 class="add-title">Nueva categoría de ahorro</h3>
          <div class="form-row">
            <input class="inp" [(ngModel)]="newAhorroNombre" placeholder="Ej: Fondo emergencias" />
            <input class="inp w-sm" type="number" [(ngModel)]="newAhorroPresupuestado" placeholder="Presupuesto mensual €" min="0" step="0.01" />
            <button class="btn-add" (click)="addAhorroTemplate()" [disabled]="!newAhorroNombre.trim()">
              <i class="pi pi-plus"></i> Añadir
            </button>
          </div>
        </div>
      </section>

      <!-- ── Ingreso Oficial / Pareja ───────────────────────────── -->
      @if (profile()?.has_partner) {
        <section class="settings-section">
          <div class="section-header">
            <h2 class="section-title">Pareja</h2>
            <p class="section-desc">Las aportaciones se calculan automáticamente a partir de tus Ingresos Fijos configurados arriba.</p>
          </div>

          <!-- Read-only list of ingresos fijos -->
          <div class="items-list">
            @for (t of templates(); track t.id) {
              <div class="list-item pareja-ingreso-item">
                <span class="item-name">{{ t.fuente }}</span>
                <span class="item-meta pareja-ingreso-amount">{{ t.esperado | currency:'EUR':'symbol':'1.0-0':'es' }}</span>
              </div>
            }
            @if (templates().length === 0) {
              <p class="empty-hint">Sin ingresos fijos configurados. Añádelos en la sección de arriba.</p>
            }
            <div class="list-item pareja-total-row">
              <span class="pareja-total-label">Total base</span>
              <span class="pareja-total-amount">{{ totalIngresosFijos() | currency:'EUR':'symbol':'1.0-0':'es' }}</span>
            </div>
          </div>

          <div class="add-form">
            <div class="form-grid">
              <div class="form-field">
                <label>% Ahorro pareja</label>
                <input class="inp" type="number" [(ngModel)]="profileAhorroPct" placeholder="10" min="0" max="100" step="0.5" />
              </div>
              <div class="form-field">
                <label>% Gastos pareja</label>
                <input class="inp" type="number" [(ngModel)]="profileGastosPct" placeholder="5" min="0" max="100" step="0.5" />
              </div>
              <div class="form-field" style="align-self:flex-end">
                <button class="btn-add" (click)="saveProfilePareja()" [disabled]="savingProfile()">
                  <i class="pi pi-save"></i> Guardar
                </button>
              </div>
            </div>
            @if (totalIngresosFijos() > 0) {
              <div class="calc-preview">
                <span>Ahorro pareja: <strong>{{ (totalIngresosFijos() * profileAhorroPct / 100) | currency:'EUR':'symbol':'1.2-2':'es' }}/mes</strong></span>
                <span>Gastos pareja: <strong>{{ (totalIngresosFijos() * profileGastosPct / 100) | currency:'EUR':'symbol':'1.2-2':'es' }}/mes</strong></span>
              </div>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .settings-page {
      display: flex;
      flex-direction: column;
      gap: 2rem;
      max-width: 760px;
    }

    .page-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--kakebo-indigo);
      margin: 0;
    }

    .settings-section {
      background: #fff;
      border: 1px solid var(--kakebo-borde);
      border-radius: 14px;
      overflow: hidden;
    }

    .section-header {
      padding: 1.25rem 1.5rem 1rem;
      border-bottom: 1px solid var(--kakebo-borde);
      background: rgba(30,58,95,.025);
    }

    .section-title {
      font-size: 1rem;
      font-weight: 700;
      color: var(--kakebo-indigo);
      margin: 0 0 .25rem;
    }

    .section-desc {
      font-size: .8rem;
      color: var(--kakebo-texto-secundario);
      margin: 0;
    }

    .items-list {
      display: flex;
      flex-direction: column;
    }

    .list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: .75rem 1.5rem;
      border-bottom: 1px solid var(--kakebo-borde);
      gap: .75rem;

      &:last-child { border-bottom: none; }
    }

    .item-info {
      display: flex;
      flex-direction: column;
      gap: .1rem;
      flex: 1;
    }

    .item-name {
      font-size: .9rem;
      font-weight: 600;
      color: var(--kakebo-texto-principal);
    }

    .item-meta {
      font-size: .75rem;
      color: var(--kakebo-texto-secundario);
    }

    .item-actions {
      display: flex;
      gap: .35rem;
    }

    .btn-icon {
      background: none;
      border: 1px solid var(--kakebo-borde);
      border-radius: 6px;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--kakebo-texto-secundario);
      transition: all .15s;
      font-size: .8rem;
      &:hover { border-color: var(--kakebo-indigo); color: var(--kakebo-indigo); }
      &.danger:hover { border-color: var(--kakebo-rojo-soft); color: var(--kakebo-rojo-soft); }
    }

    .edit-row {
      display: flex;
      align-items: center;
      gap: .5rem;
      flex-wrap: wrap;
      width: 100%;
    }

    .add-form {
      padding: 1rem 1.5rem;
      background: rgba(30,58,95,.015);
      border-top: 1px solid var(--kakebo-borde);
    }

    .add-title {
      font-size: .8rem;
      font-weight: 700;
      color: var(--kakebo-indigo);
      text-transform: uppercase;
      letter-spacing: .04em;
      margin: 0 0 .75rem;
    }

    .form-row {
      display: flex;
      gap: .5rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .inp {
      border: 1px solid var(--kakebo-borde);
      border-radius: 8px;
      padding: .45rem .75rem;
      font-size: .85rem;
      color: var(--kakebo-texto-principal);
      outline: none;
      flex: 1;
      min-width: 140px;
      background: #fff;
      &:focus { border-color: var(--kakebo-indigo); }
    }

    .w-sm { flex: 0 0 130px; min-width: 100px; }

    /* ── Pareja section styles ── */
    .pareja-ingreso-item {
      justify-content: space-between;
      padding: .6rem 1.5rem;
    }

    .pareja-ingreso-amount {
      font-size: .85rem;
      font-weight: 600;
      color: var(--kakebo-texto-principal);
    }

    .pareja-total-row {
      display: flex;
      justify-content: space-between;
      padding: .6rem 1.5rem;
      background: rgba(30,58,95,.04);
      border-top: 2px solid var(--kakebo-borde);
    }

    .pareja-total-label {
      font-size: .85rem;
      font-weight: 700;
      color: var(--kakebo-indigo);
    }

    .pareja-total-amount {
      font-size: .85rem;
      font-weight: 700;
      color: var(--kakebo-indigo);
    }

    .btn-add {
      background: var(--kakebo-indigo);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: .45rem .9rem;
      font-size: .85rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: .35rem;
      &:hover { opacity: .9; }
      &:disabled { opacity: .4; cursor: not-allowed; }
    }

    .btn-save {
      background: var(--kakebo-verde);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: .4rem .75rem;
      font-size: .82rem;
      font-weight: 600;
      cursor: pointer;
      &:hover { opacity: .85; }
    }

    .btn-cancel {
      background: none;
      border: 1px solid var(--kakebo-borde);
      border-radius: 8px;
      padding: .4rem .6rem;
      cursor: pointer;
      color: var(--kakebo-texto-secundario);
      &:hover { border-color: var(--kakebo-rojo-soft); color: var(--kakebo-rojo-soft); }
    }

    .empty-hint {
      padding: 1rem 1.5rem;
      font-size: .82rem;
      color: var(--kakebo-texto-secundario);
      font-style: italic;
    }

    /* ── Deuda-specific styles ── */
    .deuda-list-item { flex-direction: column; align-items: stretch; }
    .deuda-list-item .item-info { width: 100%; }
    .deuda-list-item > div:not(.item-info) { display: flex; justify-content: flex-end; }

    .badge {
      font-size: .68rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
    }
    .badge-bank { background: rgba(30,58,95,.1); color: var(--kakebo-indigo); }
    .badge-savings { background: rgba(197,160,89,.15); color: #8a6d2e; }
    .badge-interest { background: rgba(220,38,38,.08); color: var(--kakebo-rojo-soft); }

    .deuda-remaining-bar {
      height: 4px;
      background: var(--kakebo-borde);
      border-radius: 999px;
      margin: .4rem 0 .2rem;
      overflow: hidden;
    }
    .remaining-fill {
      height: 100%;
      background: var(--kakebo-rojo);
      border-radius: 999px;
      transition: width .3s;
    }

    .btn-link {
      background: none;
      border: none;
      color: var(--kakebo-texto-secundario);
      font-size: .8rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: .375rem;
      padding: .25rem 0;
      &:hover { color: var(--kakebo-indigo); }
    }

    /* ── Form grid (multi-column) ── */
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: .75rem .5rem;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: .3rem;

      label {
        font-size: .78rem;
        font-weight: 600;
        color: var(--kakebo-texto-principal);
      }
    }

    .field-hint {
      font-weight: 400;
      color: var(--kakebo-texto-secundario);
      font-size: .72rem;
    }

    .penalty-box {
      display: flex;
      align-items: center;
      gap: .6rem;
      padding: .45rem .75rem;
      background: rgba(220,38,38,.07);
      border: 1px solid rgba(220,38,38,.25);
      border-radius: 8px;
    }
    .penalty-rate {
      font-size: 1rem;
      font-weight: 800;
      color: var(--kakebo-rojo-soft);
    }
    .penalty-label {
      font-size: .75rem;
      color: var(--kakebo-rojo-soft);
      font-weight: 500;
    }

    .calc-preview {
      display: flex;
      gap: 1.5rem;
      flex-wrap: wrap;
      margin-top: .75rem;
      padding: .6rem .9rem;
      background: rgba(30,58,95,.04);
      border: 1px solid var(--kakebo-borde);
      border-radius: 8px;
      font-size: .83rem;
      color: var(--kakebo-texto-secundario);

      strong { color: var(--kakebo-indigo); }
    }
  `]
})
export class SettingsComponent implements OnInit {
  templates = signal<IngresoTemplate[]>([]);
  deudas = signal<Deuda[]>([]);
  deudasArchivadas = signal<Deuda[]>([]);
  ahorroTemplates = signal<AhorroTemplate[]>([]);
  profile = signal<UserProfile | null>(null);

  totalIngresosFijos = computed(() =>
    this.templates().reduce((sum, t) => sum + (t.esperado ?? 0), 0)
  );

  // Template add form
  newTplFuente = '';
  newTplEsperado = 0;

  // Template edit
  editingTemplateId = signal<string | null>(null);
  editTplFuente = '';
  editTplEsperado = 0;

  // Deuda add form
  newDeudaNombre = '';
  newDeudaTipo: 'bank' | 'savings' = 'bank';
  newDeudaCapital = 0;
  newDeudaInteres = 0;
  newDeudaMeses = 0;
  newDeudaCuotaFinal = 0;
  newDeudaStartYear = new Date().getFullYear();
  newDeudaStartMonth = new Date().getMonth() + 1;

  // Deuda edit
  editingDeudaId = signal<string | null>(null);
  editDeudaNombre = '';
  editDeudaCuota = 0;
  editDeudaMeses: number | null = null;
  showDeudasArchivadas = signal(false);

  // Ahorro template add form
  newAhorroNombre = '';
  newAhorroPresupuestado = 0;

  // Ahorro template edit
  editingAhorroId = signal<string | null>(null);
  editAhorroNombre = '';
  editAhorroPresupuestado = 0;

  // Perfil / Pareja
  profileAhorroPct = 10;
  profileGastosPct = 5;
  savingProfile = signal(false);

  readonly meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  private userId = '';

  constructor(
    private supabase: SupabaseService,
    private templatesService: IngresoTemplatesService,
    private deudasService: DeudasService,
    private ahorroTemplatesService: AhorroTemplatesService,
    private profileService: UserProfileService
  ) {}

  async ngOnInit() {
    const { data } = await this.supabase.client.auth.getSession();
    this.userId = data.session?.user.id ?? '';
    if (!this.userId) return;
    await Promise.all([
      this.loadTemplates(),
      this.loadDeudas(),
      this.loadAhorroTemplates(),
      this.loadProfile()
    ]);
  }

  // ── Computed helpers ─────────────────────────────────────────

  get newDeudaTotalConInteres(): number {
    if (this.newDeudaTipo === 'savings') return this.newDeudaCapital * 1.05;
    if (this.newDeudaMeses > 0) return this.newDeudaCuotaCalculada * this.newDeudaMeses;
    return this.newDeudaCapital;
  }

  get newDeudaCuotaCalculada(): number {
    if (this.newDeudaTipo === 'savings') {
      const total = this.newDeudaCapital * 1.05;
      return this.newDeudaMeses > 0 ? total / this.newDeudaMeses : 0;
    }
    // Amortización francesa (cuota constante)
    if (this.newDeudaMeses > 0 && this.newDeudaCapital > 0) {
      const r = this.newDeudaInteres / 12 / 100;
      if (r === 0) return this.newDeudaCapital / this.newDeudaMeses;
      const factor = Math.pow(1 + r, this.newDeudaMeses);
      return this.newDeudaCapital * r * factor / (factor - 1);
    }
    return this.newDeudaCuotaFinal;
  }

  recalcCuota() {
    const calc = this.newDeudaCuotaCalculada;
    if (calc > 0) this.newDeudaCuotaFinal = Math.round(calc * 100) / 100;
  }

  deudaProgress(d: Deuda): number {
    if (!d.total_amount) return 0;
    return Math.min(100, ((d.total_amount - d.amount_remaining) / d.total_amount) * 100);
  }

  // ── Ingreso Templates ─────────────────────────────────────────

  private async loadTemplates() {
    this.templates.set(await this.templatesService.getAll(this.userId));
  }

  async addTemplate() {
    if (!this.newTplFuente.trim()) return;
    await this.templatesService.add({
      user_id: this.userId,
      fuente: this.newTplFuente.trim(),
      esperado: this.newTplEsperado,
      dia_de_paga: null,
      order_index: this.templates().length
    });
    this.newTplFuente = '';
    this.newTplEsperado = 0;
    await this.loadTemplates();
  }

  startEditTemplate(t: IngresoTemplate) {
    this.editingTemplateId.set(t.id);
    this.editTplFuente = t.fuente;
    this.editTplEsperado = t.esperado;
  }

  async saveTemplate(id: string) {
    await this.templatesService.update(id, {
      fuente: this.editTplFuente,
      esperado: this.editTplEsperado
    });
    this.editingTemplateId.set(null);
    await this.loadTemplates();
  }

  cancelEditTemplate() { this.editingTemplateId.set(null); }

  async removeTemplate(id: string) {
    await this.templatesService.remove(id);
    await this.loadTemplates();
  }

  // ── Deudas ────────────────────────────────────────────────────

  private async loadDeudas() {
    const [active, archived] = await Promise.all([
      this.deudasService.getActive(this.userId),
      this.deudasService.getArchived(this.userId)
    ]);
    this.deudas.set(active);
    this.deudasArchivadas.set(archived);
  }

  async addDeuda() {
    if (!this.newDeudaNombre.trim() || this.newDeudaCapital <= 0) return;
    const cuota = this.newDeudaCuotaFinal;
    const interestRate = this.newDeudaTipo === 'savings' ? 5 : this.newDeudaInteres;
    const total = this.newDeudaTipo === 'savings'
      ? this.newDeudaCapital * 1.05
      : (this.newDeudaMeses > 0 ? cuota * this.newDeudaMeses : this.newDeudaCapital);
    await this.deudasService.create({
      user_id: this.userId,
      name: this.newDeudaNombre.trim(),
      type: this.newDeudaTipo,
      principal_amount: this.newDeudaCapital,
      total_amount: total,
      interest_rate: interestRate,
      monthly_payment: cuota,
      amount_remaining: total,
      is_active: true,
      start_year: this.newDeudaStartYear || null,
      start_month: this.newDeudaStartMonth || null,
      num_months: this.newDeudaMeses > 0 ? this.newDeudaMeses : null
    });
    this.newDeudaNombre = '';
    this.newDeudaTipo = 'bank';
    this.newDeudaCapital = 0;
    this.newDeudaInteres = 0;
    this.newDeudaMeses = 0;
    this.newDeudaCuotaFinal = 0;
    this.newDeudaStartYear = new Date().getFullYear();
    this.newDeudaStartMonth = new Date().getMonth() + 1;
    await this.loadDeudas();
  }

  startEditDeuda(d: Deuda) {
    this.editingDeudaId.set(d.id);
    this.editDeudaNombre = d.name;
    this.editDeudaCuota = d.monthly_payment;
    this.editDeudaMeses = d.num_months ?? null;
  }

  async saveDeuda(id: string) {
    await this.deudasService.update(id, {
      name: this.editDeudaNombre,
      monthly_payment: this.editDeudaCuota,
      num_months: this.editDeudaMeses ?? null
    });
    this.editingDeudaId.set(null);
    await this.loadDeudas();
  }

  cancelEditDeuda() { this.editingDeudaId.set(null); }

  async archiveDeuda(id: string) {
    await this.deudasService.archive(id);
    await this.loadDeudas();
  }

  async toggleDeudasArchivadas() {
    this.showDeudasArchivadas.update(v => !v);
  }

  // ── Ahorro Templates ──────────────────────────────────────────

  private async loadAhorroTemplates() {
    this.ahorroTemplates.set(await this.ahorroTemplatesService.getAll(this.userId));
  }

  async addAhorroTemplate() {
    if (!this.newAhorroNombre.trim()) return;
    await this.ahorroTemplatesService.add({
      user_id: this.userId,
      name: this.newAhorroNombre.trim(),
      presupuestado: this.newAhorroPresupuestado,
      order_index: this.ahorroTemplates().length
    });
    this.newAhorroNombre = '';
    this.newAhorroPresupuestado = 0;
    await this.loadAhorroTemplates();
  }

  startEditAhorro(a: AhorroTemplate) {
    this.editingAhorroId.set(a.id);
    this.editAhorroNombre = a.name;
    this.editAhorroPresupuestado = a.presupuestado;
  }

  async saveAhorroTemplate(id: string) {
    await this.ahorroTemplatesService.update(id, {
      name: this.editAhorroNombre,
      presupuestado: this.editAhorroPresupuestado
    });
    this.editingAhorroId.set(null);
    await this.loadAhorroTemplates();
  }

  cancelEditAhorro() { this.editingAhorroId.set(null); }

  async removeAhorroTemplate(id: string) {
    await this.ahorroTemplatesService.remove(id);
    await this.loadAhorroTemplates();
  }

  // ── Perfil / Pareja ───────────────────────────────────────────

  private async loadProfile() {
    const p = await this.profileService.getProfile(this.userId);
    this.profile.set(p);
    if (p) {
      this.profileAhorroPct = p.pareja_ahorro_pct ?? 10;
      this.profileGastosPct = p.pareja_gastos_pct ?? 5;
    }
  }

  async saveProfilePareja() {
    this.savingProfile.set(true);
    try {
      await this.profileService.upsertProfile({
        id: this.userId,
        ingreso_oficial: this.totalIngresosFijos(),
        pareja_ahorro_pct: this.profileAhorroPct,
        pareja_gastos_pct: this.profileGastosPct
      });
      await this.loadProfile();
    } finally {
      this.savingProfile.set(false);
    }
  }
}
