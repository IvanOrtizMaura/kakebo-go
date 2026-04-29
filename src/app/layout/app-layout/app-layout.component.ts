import { Component, ViewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SidebarComponent } from '../sidebar/sidebar.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, SidebarComponent],
  templateUrl: './app-layout.component.html',
  styleUrl: './app-layout.component.scss'
})
export class AppLayoutComponent {
  readonly currentYear = new Date().getFullYear();
  readonly currentMonth = new Date().getMonth() + 1;
}
