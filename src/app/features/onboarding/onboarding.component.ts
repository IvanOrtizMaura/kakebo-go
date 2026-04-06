import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { SliderModule } from 'primeng/slider';
import { TextareaModule } from 'primeng/textarea';
import { SelectButtonModule } from 'primeng/selectbutton';
import { StepperModule } from 'primeng/stepper';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../core/auth/auth.service';
import { UserProfileService } from '../../core/auth/user-profile.service';
import { IngresoTemplatesService } from '../../shared/services/ingreso-templates.service';
import { DeudasService } from '../../shared/services/deudas.service';

interface PendingDeuda {
  nombre: string;
  tipo: 'bank' | 'savings';
  capital: number;
  interes: number;
  meses: number | null;
  cuotaFinal: number;
}

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    FormsModule, CurrencyPipe, ButtonModule, InputNumberModule,
    TextareaModule, SelectButtonModule, StepperModule, MessageModule
  ],
  template: `
    <div class="onboarding-page">
      <div class="onboarding-card">
        <div class="onboarding-logo">
          <img src="/logo.png" alt="Kakebo Go" style="width:80px" />
        </div>
        <h1 class="onboarding-title">Configuremos tu Kakebo</h1>
        <p class="onboarding-subtitle">Solo necesitamos 5 datos para empezar</p>

        @if (errorMsg()) {
          <p-message severity="error" [text]="errorMsg()!" styleClass="w-full mb-3" />
        }

        <p-stepper [value]="step()" styleClass="kakebo-stepper">

          <!-- Step 1: Ingreso -->
          <p-step-panel [value]="1">
            <ng-template #content let-activateCallback="activateCallback">
              <div class="step-content">
                <div class="step-icon">💰</div>
                <h2>¿Cuál es tu ingreso neto mensual?</h2>
                <p class="step-hint">Tu salario real después de impuestos. No incluyas extras puntuales.</p>
                <div class="field-group">
                  <label class="field-label">Nombre de la fuente de ingreso</label>
                  <input class="step-inp" [(ngModel)]="newIngresoFuente" placeholder="Ej: Nómina, Freelance..." />
                </div>
                <div class="field-group">
                  <label class="field-label">Importe neto mensual</label>
                  <p-inputNumber
                    [(ngModel)]="profile.monthly_net_income"
                    mode="currency" currency="EUR" locale="es-ES"
                    placeholder="1.500,00 €"
                    styleClass="w-full step-input" />
                </div>
                <div class="step-actions">
                  <p-button label="Siguiente" icon="pi pi-arrow-right" iconPos="right"
                    styleClass="btn-primary" (onClick)="activateCallback(2)" />
                </div>
              </div>
            </ng-template>
          </p-step-panel>

          <!-- Step 2: Gastos fijos -->
          <p-step-panel [value]="2">
            <ng-template #content let-activateCallback="activateCallback">
              <div class="step-content">
                <div class="step-icon">🏠</div>
                <h2>¿Cuáles son tus gastos innegociables?</h2>
                <p class="step-hint">Gastos que no puedes eliminar: alquiler, hipoteca, seguro de coche, teléfono... Descríbelos brevemente.</p>
                <textarea pTextarea
                  [(ngModel)]="profile.fixed_expenses_description"
                  rows="4" placeholder="Ej: Alquiler 750€, Teléfono 30€, Seguro coche 50€..."
                  class="w-full" style="resize:vertical"></textarea>
                <div class="step-actions">
                  <p-button label="Atrás" icon="pi pi-arrow-left" styleClass="p-button-text"
                    (onClick)="activateCallback(1)" />
                  <p-button label="Siguiente" icon="pi pi-arrow-right" iconPos="right"
                    styleClass="btn-primary" (onClick)="activateCallback(3)" />
                </div>
              </div>
            </ng-template>
          </p-step-panel>

          <!-- Step 3: Ahorro -->
          <p-step-panel [value]="3">
            <ng-template #content let-activateCallback="activateCallback">
              <div class="step-content">
                <div class="step-icon">🎯</div>
                <h2>¿Qué % de ahorro te hace sentir seguro?</h2>
                <p class="step-hint">El porcentaje de tus ingresos que quieres destinar al ahorro cada mes. El japonés tradicional recomienda el 20%.</p>
                <div class="slider-row">
                  <input type="range" class="kakebo-slider"
                    [(ngModel)]="profile.savings_percentage"
                    [min]="0" [max]="50" step="1"
                    [style.background]="sliderBackground" />
                  <span class="slider-value">{{ profile.savings_percentage }}%</span>
                </div>
                <div class="step-actions">
                  <p-button label="Atrás" icon="pi pi-arrow-left" styleClass="p-button-text"
                    (onClick)="activateCallback(2)" />
                  <p-button label="Siguiente" icon="pi pi-arrow-right" iconPos="right"
                    styleClass="btn-primary" (onClick)="activateCallback(4)" />
                </div>
              </div>
            </ng-template>
          </p-step-panel>

          <!-- Step 4: Deudas -->
          <p-step-panel [value]="4">
            <ng-template #content let-activateCallback="activateCallback">
              <div class="step-content">
                <div class="step-icon">💳</div>
                <h2>¿Tienes deudas activas?</h2>
                <p class="step-hint">Añade tus préstamos y deudas. Podrás editarlas después en Configuración.</p>

                <!-- Lista de deudas añadidas -->
                <div class="deuda-list">
                  @for (d of pendingDeudas; track $index) {
                    <div class="deuda-item">
                      <div class="deuda-item-info">
                        <span class="deuda-nombre">{{ d.nombre }}</span>
                        <span class="deuda-meta">
                          {{ d.tipo === 'bank' ? 'Banco' : 'Ahorros' }} ·
                          {{ d.capital | currency:'EUR':'symbol':'1.0-0':'es' }} ·
                          {{ d.interes }}% interés
                          @if (d.meses) { · {{ d.meses }} meses }
                        </span>
                      </div>
                      <div class="deuda-item-right">
                        <span class="deuda-cuota">{{ d.cuotaFinal | currency:'EUR':'symbol':'1.2-2':'es' }}/mes</span>
                        <button class="btn-remove" (click)="removeDeuda($index)">
                          <i class="pi pi-trash"></i>
                        </button>
                      </div>
                    </div>
                  }
                  @if (pendingDeudas.length === 0) {
                    <p class="empty-deudas">Sin deudas añadidas. Puedes saltar este paso.</p>
                  }
                </div>

                <!-- Formulario para añadir deuda -->
                <div class="deuda-form">
                  <p class="deuda-form-title">Añadir deuda</p>
                  <div class="deuda-grid">
                    <div class="field-group full">
                      <label class="field-label">Nombre</label>
                      <input class="step-inp" [(ngModel)]="newDeudaNombre" placeholder="Ej: Préstamo coche" />
                    </div>
                    <div class="field-group">
                      <label class="field-label">Tipo</label>
                      <p-selectButton
                        [ngModel]="newDeudaTipo"
                        (ngModelChange)="newDeudaTipo=$event; recalcCuota()"
                        [options]="tipoDeudaOptions"
                        optionLabel="label" optionValue="value"
                        styleClass="kakebo-toggle tipo-toggle" />
                    </div>
                    <div class="field-group">
                      <label class="field-label">Capital prestado (€)</label>
                      <input class="step-inp" type="number"
                        [ngModel]="newDeudaCapital"
                        (ngModelChange)="newDeudaCapital=$event; recalcCuota()"
                        placeholder="0.00" min="0" step="0.01" />
                    </div>
                    <div class="field-group">
                      <label class="field-label">TIN anual (%)</label>
                      @if (newDeudaTipo === 'savings') {
                        <div class="penalty-box">
                          <span class="penalty-rate">5%</span>
                          <span class="penalty-label">⚠️ Castigo por usar ahorros</span>
                        </div>
                      } @else {
                        <input class="step-inp" type="number"
                          [ngModel]="newDeudaInteres"
                          (ngModelChange)="newDeudaInteres=$event; recalcCuota()"
                          placeholder="Ej: 5.5" min="0" step="0.01" />
                      }
                    </div>
                    <div class="field-group">
                      <label class="field-label">Nº meses <span class="field-hint">(vacío = indefinida)</span></label>
                      <input class="step-inp" type="number"
                        [ngModel]="newDeudaMeses"
                        (ngModelChange)="newDeudaMeses=$event; recalcCuota()"
                        placeholder="Ej: 60" min="1" step="1" />
                    </div>
                    <div class="field-group">
                      <label class="field-label">Cuota mensual (€) <span class="field-hint">edita si no coincide</span></label>
                      <input class="step-inp" type="number" [(ngModel)]="newDeudaCuotaFinal"
                        placeholder="0.00" min="0" step="0.01" />
                    </div>
                  </div>
                  @if (newDeudaCapital > 0 && newDeudaCuotaFinal > 0 && newDeudaMeses) {
                    <div class="calc-preview">
                      <span>Total estimado: <strong>{{ (newDeudaCuotaFinal * newDeudaMeses) | currency:'EUR':'symbol':'1.2-2':'es' }}</strong></span>
                    </div>
                  }
                  <div style="margin-top:.75rem">
                    <p-button label="Añadir deuda" icon="pi pi-plus"
                      styleClass="btn-secondary"
                      [disabled]="!newDeudaNombre.trim() || newDeudaCapital <= 0"
                      (onClick)="addDeuda()" />
                  </div>
                </div>

                <div class="step-actions">
                  <p-button label="Atrás" icon="pi pi-arrow-left" styleClass="p-button-text"
                    (onClick)="activateCallback(3)" />
                  <p-button label="Siguiente" icon="pi pi-arrow-right" iconPos="right"
                    styleClass="btn-primary" (onClick)="activateCallback(5)" />
                </div>
              </div>
            </ng-template>
          </p-step-panel>

          <!-- Step 5: Pareja -->
          <p-step-panel [value]="5">
            <ng-template #content let-activateCallback="activateCallback">
              <div class="step-content">
                <div class="step-icon">👫</div>
                <h2>¿Tienes pareja?</h2>
                <p class="step-hint">Si tienes pareja, activaremos la sección de gastos compartidos en tu Kakebo mensual.</p>
                <p-selectButton
                  [(ngModel)]="profile.has_partner"
                  [options]="yesNoOptions"
                  optionLabel="label" optionValue="value"
                  styleClass="kakebo-toggle" />
                <div class="step-actions">
                  <p-button label="Atrás" icon="pi pi-arrow-left" styleClass="p-button-text"
                    (onClick)="activateCallback(4)" />
                  <p-button label="¡Empezar!" icon="pi pi-check" iconPos="right"
                    styleClass="btn-primary" [loading]="loading()" (onClick)="onFinish()" />
                </div>
              </div>
            </ng-template>
          </p-step-panel>

        </p-stepper>
      </div>
    </div>
  `,
  styles: [`
    .onboarding-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--kakebo-crema);
      padding: 1rem;
    }

    .onboarding-card {
      background: #fff;
      border-radius: 16px;
      border: 1px solid var(--kakebo-borde);
      padding: 2rem 1.75rem;
      width: 100%;
      max-width: 480px;
      box-shadow: 0 4px 24px rgba(30,58,95,0.08);
    }

    .onboarding-logo { text-align: center; margin-bottom: 1rem; }
    .onboarding-title { font-size: 1.35rem; font-weight: 700; color: var(--kakebo-indigo); text-align: center; margin-bottom: 0.25rem; }
    .onboarding-subtitle { color: var(--kakebo-texto-secundario); text-align: center; font-size: 0.875rem; margin-bottom: 1.5rem; }

    .step-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1rem 0;

      h2 { font-size: 1.05rem; font-weight: 700; color: var(--kakebo-indigo); }
      .step-hint { font-size: 0.85rem; color: var(--kakebo-texto-secundario); line-height: 1.5; }
      .step-icon { font-size: 2rem; }
    }

    .slider-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      width: 100%;
    }

    .kakebo-slider {
      flex: 1;
      -webkit-appearance: none;
      appearance: none;
      height: 8px;
      border-radius: 999px;
      outline: none;
      cursor: pointer;

      &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--kakebo-indigo);
        border: 3px solid #fff;
        box-shadow: 0 0 0 2px var(--kakebo-indigo);
        cursor: pointer;
        transition: box-shadow .15s;
      }

      &::-moz-range-thumb {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--kakebo-indigo);
        border: 3px solid #fff;
        box-shadow: 0 0 0 2px var(--kakebo-indigo);
        cursor: pointer;
      }

      &:focus::-webkit-slider-thumb {
        box-shadow: 0 0 0 4px rgba(30,58,95,.25);
      }
    }

    .slider-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--kakebo-indigo);
      min-width: 3.5rem;
      text-align: right;
    }

    .step-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }

    .btn-primary { background: var(--kakebo-indigo) !important; border-color: var(--kakebo-indigo) !important; }

    .btn-secondary {
      background: #fff !important;
      border: 1px solid var(--kakebo-indigo) !important;
      color: var(--kakebo-indigo) !important;
    }

    :host ::ng-deep .kakebo-toggle .p-selectbutton .p-button.p-highlight {
      background: var(--kakebo-indigo);
      border-color: var(--kakebo-indigo);
    }

    /* ── New fields ── */
    .field-group {
      display: flex;
      flex-direction: column;
      gap: .3rem;
    }

    .field-group.full { grid-column: 1 / -1; }

    .field-label {
      font-size: .78rem;
      font-weight: 600;
      color: var(--kakebo-texto-principal);
    }

    .field-hint {
      font-weight: 400;
      color: var(--kakebo-texto-secundario);
      font-size: .72rem;
    }

    .step-inp {
      border: 1px solid var(--kakebo-borde);
      border-radius: 8px;
      padding: .45rem .75rem;
      font-size: .875rem;
      color: var(--kakebo-texto-principal);
      outline: none;
      width: 100%;
      background: #fff;
      box-sizing: border-box;
      &:focus { border-color: var(--kakebo-indigo); }
    }

    /* ── Deuda list ── */
    .deuda-list {
      display: flex;
      flex-direction: column;
      gap: .4rem;
      border: 1px solid var(--kakebo-borde);
      border-radius: 10px;
      overflow: hidden;
    }

    .deuda-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: .6rem .9rem;
      border-bottom: 1px solid var(--kakebo-borde);
      gap: .75rem;
      &:last-child { border-bottom: none; }
    }

    .deuda-item-info {
      display: flex;
      flex-direction: column;
      gap: .1rem;
      flex: 1;
    }

    .deuda-nombre {
      font-size: .875rem;
      font-weight: 600;
      color: var(--kakebo-texto-principal);
    }

    .deuda-meta {
      font-size: .75rem;
      color: var(--kakebo-texto-secundario);
    }

    .deuda-item-right {
      display: flex;
      align-items: center;
      gap: .5rem;
    }

    .deuda-cuota {
      font-size: .82rem;
      font-weight: 600;
      color: var(--kakebo-indigo);
    }

    .btn-remove {
      background: none;
      border: 1px solid var(--kakebo-borde);
      border-radius: 6px;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--kakebo-texto-secundario);
      font-size: .75rem;
      &:hover { border-color: var(--kakebo-rojo-soft); color: var(--kakebo-rojo-soft); }
    }

    .empty-deudas {
      padding: .75rem 1rem;
      font-size: .82rem;
      color: var(--kakebo-texto-secundario);
      font-style: italic;
      margin: 0;
    }

    /* ── Deuda add form ── */
    .deuda-form {
      border: 1px solid var(--kakebo-borde);
      border-radius: 10px;
      padding: .9rem;
      background: rgba(30,58,95,.015);
    }

    .deuda-form-title {
      font-size: .78rem;
      font-weight: 700;
      color: var(--kakebo-indigo);
      text-transform: uppercase;
      letter-spacing: .04em;
      margin: 0 0 .75rem;
    }

    .deuda-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: .6rem .5rem;
    }

    .penalty-box {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: .45rem .75rem;
      background: rgba(220,38,38,.07);
      border: 1px solid rgba(220,38,38,.25);
      border-radius: 8px;
    }
    .penalty-rate { font-size: .95rem; font-weight: 800; color: var(--kakebo-rojo-soft); }
    .penalty-label { font-size: .72rem; color: var(--kakebo-rojo-soft); }

    .calc-preview {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin-top: .6rem;
      padding: .5rem .75rem;
      background: rgba(30,58,95,.04);
      border: 1px solid var(--kakebo-borde);
      border-radius: 8px;
      font-size: .8rem;
      color: var(--kakebo-texto-secundario);
      strong { color: var(--kakebo-indigo); }
    }

    :host ::ng-deep .tipo-toggle .p-selectbutton { display: flex; }
    :host ::ng-deep .tipo-toggle .p-selectbutton .p-button { flex: 1; font-size: .8rem; padding: .4rem; }
  `]
})
export class OnboardingComponent {
  step = signal(1);
  loading = signal(false);
  errorMsg = signal<string | null>(null);

  profile = {
    monthly_net_income: 0,
    fixed_expenses_description: '',
    savings_percentage: 20,
    has_partner: false
  };

  // Step 1 — ingreso fijo
  newIngresoFuente = 'Nómina';

  // Step 4 — deudas
  pendingDeudas: PendingDeuda[] = [];
  newDeudaNombre = '';
  newDeudaTipo: 'bank' | 'savings' = 'bank';
  newDeudaCapital = 0;
  newDeudaInteres = 0;
  newDeudaMeses: number | null = null;

  newDeudaCuotaFinal = 0;

  yesNoOptions = [
    { label: 'Sí', value: true },
    { label: 'No', value: false }
  ];

  tipoDeudaOptions = [
    { label: 'Banco', value: 'bank' },
    { label: 'Ahorros', value: 'savings' }
  ];

  get sliderBackground(): string {
    const pct = (this.profile.savings_percentage / 50) * 100;
    return `linear-gradient(to right, var(--kakebo-indigo) ${pct}%, #e5e7eb ${pct}%)`;
  }

  get newDeudaTotalConInteres(): number {
    if (this.newDeudaTipo === 'savings') return this.newDeudaCapital * 1.05;
    if (this.newDeudaMeses && this.newDeudaMeses > 0) return this.newDeudaCuotaCalculada * this.newDeudaMeses;
    return this.newDeudaCapital;
  }

  get newDeudaCuotaCalculada(): number {
    if (this.newDeudaTipo === 'savings') {
      const total = this.newDeudaCapital * 1.05;
      return this.newDeudaMeses ? total / this.newDeudaMeses : 0;
    }
    // Amortización francesa (cuota constante)
    if (this.newDeudaMeses && this.newDeudaMeses > 0 && this.newDeudaCapital > 0) {
      const r = this.newDeudaInteres / 12 / 100;
      if (r === 0) return this.newDeudaCapital / this.newDeudaMeses;
      const factor = Math.pow(1 + r, this.newDeudaMeses);
      return this.newDeudaCapital * r * factor / (factor - 1);
    }
    return 0;
  }

  constructor(
    private auth: AuthService,
    private profileService: UserProfileService,
    private ingresoTemplatesService: IngresoTemplatesService,
    private deudasService: DeudasService,
    private router: Router
  ) {}

  recalcCuota() {
    const calc = this.newDeudaCuotaCalculada;
    if (calc > 0) this.newDeudaCuotaFinal = Math.round(calc * 100) / 100;
  }

  addDeuda() {
    if (!this.newDeudaNombre.trim() || this.newDeudaCapital <= 0) return;
    this.pendingDeudas.push({
      nombre: this.newDeudaNombre.trim(),
      tipo: this.newDeudaTipo,
      capital: this.newDeudaCapital,
      interes: this.newDeudaTipo === 'savings' ? 5 : this.newDeudaInteres,
      meses: this.newDeudaMeses && this.newDeudaMeses > 0 ? this.newDeudaMeses : null,
      cuotaFinal: this.newDeudaCuotaFinal
    });
    this.newDeudaNombre = '';
    this.newDeudaTipo = 'bank';
    this.newDeudaCapital = 0;
    this.newDeudaInteres = 0;
    this.newDeudaMeses = null;
    this.newDeudaCuotaFinal = 0;
  }

  removeDeuda(index: number) {
    this.pendingDeudas.splice(index, 1);
  }

  deudaCuota(d: PendingDeuda): number {
    return d.cuotaFinal;
  }

  async onFinish() {
    const user = this.auth.currentUser;
    if (!user) return;

    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      // 1. Guardar perfil
      await this.profileService.upsertProfile({
        id: user.id,
        ...this.profile,
        has_high_interest_debt: this.pendingDeudas.some(d => d.tipo === 'bank' && d.interes > 10),
        onboarding_completed: true
      });

      // 2. Crear ingreso fijo template
      if (this.profile.monthly_net_income > 0 && this.newIngresoFuente.trim()) {
        await this.ingresoTemplatesService.add({
          user_id: user.id,
          fuente: this.newIngresoFuente.trim(),
          esperado: this.profile.monthly_net_income,
          dia_de_paga: null,
          order_index: 0
        });
      }

      // 3. Crear entradas de deudas
      const now = new Date();
      for (const d of this.pendingDeudas) {
        const cuota = this.deudaCuota(d);
        const interestRate = d.tipo === 'savings' ? 5 : d.interes;
        const total = d.tipo === 'savings'
          ? d.capital * 1.05
          : (d.meses ? cuota * d.meses : d.capital);
        await this.deudasService.create({
          user_id: user.id,
          name: d.nombre,
          type: d.tipo,
          principal_amount: d.capital,
          total_amount: total,
          interest_rate: interestRate,
          monthly_payment: cuota,
          amount_remaining: total,
          is_active: true,
          start_year: now.getFullYear(),
          start_month: now.getMonth() + 1,
          num_months: d.meses
        });
      }

      this.router.navigate(['/dashboard']);
    } catch (err: unknown) {
      this.errorMsg.set((err as Error).message ?? 'Error al guardar el perfil');
    } finally {
      this.loading.set(false);
    }
  }
}
