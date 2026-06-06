import { Component, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';
import { InversionesService } from '../../../shared/services/inversiones.service';
import { InversionOro } from '../../../shared/models';

@Component({
  selector: 'app-inversiones-hub',
  standalone: true,
  imports: [CurrencyPipe, BottomNavComponent],
  templateUrl: './hub.component.html',
  styleUrl: './hub.component.scss'
})
export class InversionesHubComponent {
  private readonly router = inject(Router);
  private readonly inversionesService = inject(InversionesService);

  readonly oroinversiones = toSignal(this.inversionesService.getAll(), { initialValue: [] as InversionOro[] });

  readonly oroTotalInvertido = computed(() =>
    this.oroinversiones().reduce((sum, inversion) => sum + inversion.precio_compra, 0)
  );

  readonly oroTotalItems = computed(() => this.oroinversiones().length);

  navigateBack(): void {
    this.router.navigate(['/mas']);
  }

  navigateToOro(): void {
    this.router.navigate(['/inversiones/oro']);
  }

  navigateToPensiones(): void {
    this.router.navigate(['/inversiones/pensiones']);
  }
}
