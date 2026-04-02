import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    FormsModule, ButtonModule, InputNumberModule, SliderModule,
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
                <p-inputNumber
                  [(ngModel)]="profile.monthly_net_income"
                  mode="currency" currency="EUR" locale="es-ES"
                  placeholder="1.500,00 €"
                  styleClass="w-full step-input" />
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
                  <p-slider [(ngModel)]="profile.savings_percentage" [min]="0" [max]="50" styleClass="w-full" />
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
                <h2>¿Tienes deudas con intereses altos?</h2>
                <p class="step-hint">Tarjetas de crédito, préstamos personales con más del 10% de interés annual...</p>
                <p-selectButton
                  [(ngModel)]="profile.has_high_interest_debt"
                  [options]="yesNoOptions"
                  optionLabel="label" optionValue="value"
                  styleClass="kakebo-toggle" />
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
      .slider-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--kakebo-indigo);
        min-width: 3rem;
        text-align: right;
      }
    }

    .step-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }

    .btn-primary { background: var(--kakebo-indigo) !important; border-color: var(--kakebo-indigo) !important; }

    :host ::ng-deep .kakebo-toggle .p-selectbutton .p-button.p-highlight {
      background: var(--kakebo-indigo);
      border-color: var(--kakebo-indigo);
    }
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
    has_high_interest_debt: false,
    has_partner: false
  };

  yesNoOptions = [
    { label: 'Sí', value: true },
    { label: 'No', value: false }
  ];

  constructor(
    private auth: AuthService,
    private profileService: UserProfileService,
    private router: Router
  ) {}

  async onFinish() {
    const user = this.auth.currentUser;
    if (!user) return;

    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      await this.profileService.upsertProfile({
        id: user.id,
        ...this.profile,
        onboarding_completed: true
      });
      this.router.navigate(['/dashboard']);
    } catch (err: unknown) {
      this.errorMsg.set((err as Error).message ?? 'Error al guardar el perfil');
    } finally {
      this.loading.set(false);
    }
  }
}
