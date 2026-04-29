import { Component, signal, computed } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/auth/auth.service';

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, ButtonModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  open = signal(typeof window !== 'undefined' && window.innerWidth >= 768);
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
