import { Component, inject, computed } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.scss'
})
export class BottomNavComponent {
  private readonly router = inject(Router);

  readonly currentYear = new Date().getFullYear();
  readonly currentMonth = new Date().getMonth() + 1;

  readonly monthLink = computed(() => ['/m', this.currentYear, this.currentMonth]);
}
