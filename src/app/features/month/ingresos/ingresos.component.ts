import { Component, signal, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Dialog } from 'primeng/dialog';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { filter, switchMap, map } from 'rxjs';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';
import { AuthService } from '../../../core/auth/auth.service';
import { MonthService } from '../../../shared/services/month.service';
import { IngresosService } from '../../../shared/services/ingresos.service';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface IngresoViewItem {
  id: string;
  fuente: string;
  esperado: number;
  real: number;
  dia_paga: string | null;
  depositado: boolean;
}

@Component({
  selector: 'app-ingresos',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, BottomNavComponent],
  templateUrl: './ingresos.component.html',
  styleUrl: './ingresos.component.scss'
})
export class IngresosComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly monthService = inject(MonthService);
  private readonly ingresosService = inject(IngresosService);

  readonly mesNombre = `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`;

  private readonly currentMonthId = signal<string | null>(null);

  readonly ingresos = toSignal(
    toObservable(this.currentMonthId).pipe(
      filter((id): id is string => id !== null),
      switchMap(id =>
        this.ingresosService.getAll(id).pipe(
          map(items => items.map((item): IngresoViewItem => ({
            id: item.id,
            fuente: item.fuente,
            esperado: item.esperado,
            real: item.real,
            dia_paga: item.dia_de_paga,
            depositado: item.depositado
          })))
        )
      )
    ),
    { initialValue: [] as IngresoViewItem[] }
  );

  readonly totalReal = computed(() =>
    this.ingresos().reduce((sum, ingreso) => sum + ingreso.real, 0)
  );

  readonly totalEsperado = computed(() =>
    this.ingresos().reduce((sum, ingreso) => sum + ingreso.esperado, 0)
  );

  readonly progresoTotal = computed(() => {
    const esperado = this.totalEsperado();
    if (esperado === 0) return 0;
    return Math.min((this.totalReal() / esperado) * 100, 100);
  });

  readonly dialogVisible = signal(false);
  readonly nuevoNombre = signal('');
  readonly nuevoGastoImporte = signal<number | null>(null);

  constructor() {
    const user = this.authService.currentUser;
    if (user) {
      const now = new Date();
      this.monthService.getOrCreateMonth(user.uid, now.getFullYear(), now.getMonth() + 1)
        .then(month => this.currentMonthId.set(month.id))
        .catch(error => console.error('Error al cargar mes:', error));
    }
  }

  navigateToHome(): void {
    this.router.navigate(['/home']);
  }

  openDialog(): void {
    this.nuevoNombre.set('');
    this.nuevoGastoImporte.set(null);
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  async guardarIngreso(): Promise<void> {
    const monthId = this.currentMonthId();
    const user = this.authService.currentUser;
    const fuente = this.nuevoNombre().trim();
    const importe = this.nuevoGastoImporte();

    if (!monthId || !user || !fuente || importe === null || importe <= 0) return;

    try {
      await this.ingresosService.add({
        month_id: monthId,
        user_id: user.uid,
        fuente,
        esperado: importe,
        real: 0,
        dia_de_paga: null,
        depositado: false,
        order_index: this.ingresos().length
      });
      this.closeDialog();
    } catch (error) {
      console.error('Error al guardar ingreso:', error);
    }
  }
}
