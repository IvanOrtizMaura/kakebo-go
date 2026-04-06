import { Component, ViewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SidebarComponent } from '../sidebar/sidebar.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, ButtonModule, SidebarComponent],
  template: `
    <div class="app-shell" [class.sidebar-open]="sidebar.open()">
      <app-sidebar #sidebar />

      <div class="main-area">
        <header class="topbar">
          <button class="hamburger" (click)="sidebar.toggle()">
            <i class="pi pi-bars"></i>
          </button>
        </header>

        <main class="main-content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [`
    .app-shell {
      display: flex;
      min-height: 100vh;
    }

    .main-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      margin-left: 0;
      transition: margin-left 0.25s ease;
      min-width: 0;
    }

    .app-shell.sidebar-open .main-area {
      margin-left: 240px;
    }

    .topbar {
      display: flex;
      align-items: center;
      padding: 0.75rem 1rem;
      background: #fff;
      border-bottom: 1px solid var(--kakebo-borde);
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .hamburger {
      background: none;
      border: none;
      font-size: 1.25rem;
      color: var(--kakebo-indigo);
      cursor: pointer;
      padding: 0.25rem;
    }

    .main-content {
      flex: 1;
      padding: 1.5rem 1.25rem;
      max-width: 900px;
      width: 100%;
      margin: 0 auto;
      min-width: 0;
    }

    @media (min-width: 768px) {
      .main-content { padding: 2rem 1.5rem; }
    }
  `]
})
export class AppLayoutComponent {}
