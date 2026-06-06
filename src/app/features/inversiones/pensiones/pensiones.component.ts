import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';

@Component({
  selector: 'app-pensiones',
  standalone: true,
  imports: [BottomNavComponent],
  templateUrl: './pensiones.component.html',
  styleUrl: './pensiones.component.scss'
})
export class PensionesComponent {
  private readonly router = inject(Router);

  navigateBack(): void {
    this.router.navigate(['/inversiones']);
  }
}
