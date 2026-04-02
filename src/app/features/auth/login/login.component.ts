import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';
import { DividerModule } from 'primeng/divider';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, PasswordModule, MessageModule, DividerModule],
  template: `
    <div class="login-page">
      <div class="login-card">
        <div class="login-logo">
          <img src="/logo.png" alt="Kakebo Go" class="logo-img" />
        </div>

        <h1 class="login-title">Bienvenido</h1>
        <p class="login-subtitle">El método japonés en tu bolsillo</p>

        @if (errorMsg()) {
          <p-message severity="error" [text]="errorMsg()!" styleClass="w-full mb-3" />
        }

        <div class="login-form">
          <div class="field">
            <label for="email">Correo electrónico</label>
            <input
              pInputText id="email" type="email"
              [(ngModel)]="email" placeholder="tu@email.com"
              class="w-full" autocomplete="email" />
          </div>

          <div class="field">
            <label for="password">Contraseña</label>
            <p-password
              inputId="password" [(ngModel)]="password"
              [feedback]="false" [toggleMask]="true"
              placeholder="••••••••" styleClass="w-full" />
          </div>

          <p-button
            label="Iniciar sesión"
            styleClass="w-full btn-primary"
            [loading]="loading()"
            (onClick)="onLogin()" />

          <p-divider align="center">
            <span class="divider-text">o</span>
          </p-divider>

          <p-button
            label="Continuar con Google"
            icon="pi pi-google"
            styleClass="w-full p-button-outlined"
            [loading]="loadingGoogle()"
            (onClick)="onGoogle()" />
        </div>

        <p class="login-footer">
          ¿No tienes cuenta?
          <a routerLink="/auth/register">Crear cuenta</a>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--kakebo-crema);
      padding: 1rem;
    }

    .login-card {
      background: #fff;
      border-radius: 16px;
      border: 1px solid var(--kakebo-borde);
      padding: 2rem 1.75rem;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 4px 24px rgba(30, 58, 95, 0.08);
    }

    .login-logo {
      text-align: center;
      margin-bottom: 1.25rem;
    }

    .logo-img {
      width: 120px;
      height: auto;
    }

    .login-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--kakebo-indigo);
      text-align: center;
      margin-bottom: 0.25rem;
    }

    .login-subtitle {
      color: var(--kakebo-texto-secundario);
      text-align: center;
      font-size: 0.875rem;
      margin-bottom: 1.75rem;
    }

    .login-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;

      label {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--kakebo-texto-principal);
      }
    }

    .divider-text {
      color: var(--kakebo-texto-secundario);
      font-size: 0.8rem;
      padding: 0 0.5rem;
    }

    .btn-primary {
      background: var(--kakebo-indigo) !important;
      border-color: var(--kakebo-indigo) !important;
    }

    .login-footer {
      text-align: center;
      margin-top: 1.5rem;
      font-size: 0.875rem;
      color: var(--kakebo-texto-secundario);

      a {
        color: var(--kakebo-rojo);
        font-weight: 600;
        margin-left: 0.25rem;
      }
    }
  `]
})
export class LoginComponent {
  email = '';
  password = '';
  loading = signal(false);
  loadingGoogle = signal(false);
  errorMsg = signal<string | null>(null);

  constructor(private auth: AuthService, private router: Router) {}

  async onLogin() {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      await this.auth.signInWithEmail(this.email, this.password);
      this.router.navigate(['/dashboard']);
    } catch (err: unknown) {
      this.errorMsg.set((err as Error).message ?? 'Error al iniciar sesión');
    } finally {
      this.loading.set(false);
    }
  }

  async onGoogle() {
    this.loadingGoogle.set(true);
    this.errorMsg.set(null);
    try {
      await this.auth.signInWithGoogle();
    } catch (err: unknown) {
      this.errorMsg.set((err as Error).message ?? 'Error con Google');
      this.loadingGoogle.set(false);
    }
  }
}
