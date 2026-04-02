import { Component, signal, computed } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/auth/auth.service';

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, ButtonModule],
  template: `
    <aside class="sidebar" [class.open]="open()">
      <div class="sidebar-header">
        <img src="/logo.png" alt="Kakebo Go" class="sidebar-logo" />
        <p class="sidebar-user">{{ userEmail() }}</p>
      </div>

      <nav class="sidebar-nav">
        <a routerLink="/dashboard" routerLinkActive="active" class="nav-item dashboard-item"
           (click)="close()">
          <i class="pi pi-home"></i>
          <span>Resumen Anual</span>
        </a>

        <div class="year-selector">
          <button class="year-btn" (click)="prevYear()"><i class="pi pi-chevron-left"></i></button>
          <span class="year-label">{{ year() }}</span>
          <button class="year-btn" [disabled]="year() >= currentYear" (click)="nextYear()"><i class="pi pi-chevron-right"></i></button>
        </div>

        <div class="months-list">
          @for (m of monthList; track m.index) {
            <a
              [routerLink]="['/m', year(), m.index]"
              routerLinkActive="active"
              class="nav-item month-item"
              [class.current]="m.index === currentMonth && year() === currentYear"
              (click)="close()">
              <span class="month-name">{{ m.name }}</span>
              @if (m.index === currentMonth && year() === currentYear) {
                <span class="current-badge">Hoy</span>
              }
            </a>
          }
        </div>
      </nav>

      <div class="sidebar-footer">
        <a routerLink="/settings" routerLinkActive="active" class="nav-item settings-item" (click)="close()">
          <i class="pi pi-cog"></i>
          <span>Configuración</span>
        </a>
        <button class="signout-btn" (click)="onSignOut()">
          <i class="pi pi-sign-out"></i>
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>

    <!-- Mobile overlay -->
    <div class="sidebar-overlay" [class.visible]="open()" (click)="close()"></div>
  `,
  styles: [`
    .sidebar {
      width: 240px;
      min-height: 100vh;
      background: var(--kakebo-indigo);
      display: flex;
      flex-direction: column;
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      z-index: 100;
      transform: translateX(0);
      transition: transform 0.25s ease;
    }

    @media (max-width: 767px) {
      .sidebar {
        transform: translateX(-100%);
        &.open { transform: translateX(0); }
      }
      .sidebar-overlay {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.4);
        z-index: 99;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s ease;
        &.visible { opacity: 1; pointer-events: all; }
      }
    }

    @media (min-width: 768px) {
      .sidebar-overlay { display: none; }
    }

    .sidebar-header {
      padding: 1.5rem 1rem 1rem;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .sidebar-logo {
      width: 100px;
      display: block;
      margin: 0 auto 0.75rem;
      border-radius: 10px;
    }

    .sidebar-user {
      color: rgba(255,255,255,0.6);
      font-size: 0.75rem;
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sidebar-nav {
      flex: 1;
      overflow-y: auto;
      padding: 0.75rem 0;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.625rem 1rem;
      color: rgba(255,255,255,0.75);
      font-size: 0.875rem;
      cursor: pointer;
      border-radius: 0;
      transition: background 0.15s, color 0.15s;
      text-decoration: none;

      &:hover { background: rgba(255,255,255,0.08); color: #fff; }
      &.active { background: rgba(197,160,89,0.25); color: var(--kakebo-dorado); font-weight: 600; }
      &.current { color: #fff; font-weight: 600; }
    }

    .dashboard-item {
      margin-bottom: 0.25rem;
      .pi { font-size: 0.875rem; }
    }

    .year-selector {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 1rem;
      margin: 0.25rem 0;
    }

    .year-btn {
      background: none;
      border: none;
      color: rgba(255,255,255,0.5);
      cursor: pointer;
      padding: 0.25rem;
      &:hover { color: #fff; }
      &:disabled { opacity: 0.3; cursor: not-allowed; }
    }

    .year-label {
      color: #fff;
      font-weight: 700;
      font-size: 0.9rem;
    }

    .months-list {
      display: flex;
      flex-direction: column;
    }

    .month-item {
      justify-content: space-between;
    }

    .month-name { flex: 1; }

    .current-badge {
      font-size: 0.65rem;
      background: var(--kakebo-dorado);
      color: var(--kakebo-indigo);
      border-radius: 999px;
      padding: 1px 6px;
      font-weight: 700;
    }

    .sidebar-footer {
      border-top: 1px solid rgba(255,255,255,0.1);
      padding: 0.75rem 0;
    }

    .settings-item {
      padding: 0.625rem 1rem;
      .pi { font-size: 0.875rem; }
    }

    .signout-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: none;
      border: none;
      color: rgba(255,255,255,0.5);
      font-size: 0.8rem;
      cursor: pointer;
      width: 100%;
      padding: 0.5rem 1rem;
      &:hover { color: #fff; }
    }
  `]
})
export class SidebarComponent {
  open = signal(false);
  year = signal(new Date().getFullYear());
  readonly currentYear = new Date().getFullYear();
  readonly currentMonth = new Date().getMonth() + 1;

  monthList = MONTHS.map((name, i) => ({ name, index: i + 1 }));

  userEmail = computed(() => this.auth.currentUser?.email ?? '');

  constructor(private auth: AuthService, private router: Router) {}

  toggle() { this.open.update(v => !v); }
  close() { this.open.set(false); }

  prevYear() { this.year.update(y => y - 1); }
  nextYear() {
    if (this.year() < this.currentYear) this.year.update(y => y + 1);
  }

  async onSignOut() {
    await this.auth.signOut();
  }
}
