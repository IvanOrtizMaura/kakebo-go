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
import { SectionService } from '../../../shared/services/section.service';
import { Gasto } from '../../../shared/models';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface GastoViewItem {
  id: string;
  nombre: string;
  presupuestado: number;
  real: number;
}

@Component({
  selector: 'app-gastos',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, BottomNavComponent],
  templateUrl: './gastos.component.html',
  styleUrl: './gastos.component.scss'
})
export class GastosComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly monthService = inject(MonthService);
  private readonly sectionService = inject(SectionService);

  readonly mesNombre = `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`;

  private readonly currentMonthId = signal<string | null>(null);

  readonly gastos = toSignal(
    toObservable(this.currentMonthId).pipe(
      filter((id): id is string => id !== null),
      switchMap(id =>
        (this.sectionService.gastos.getAll(id) as ReturnType<typeof this.sectionService.gastos.getAll>).pipe(
          map(items => (items as unknown as Gasto[]).map((item): GastoViewItem => ({
            id: item.id,
            nombre: item.name,
            presupuestado: item.presupuestado,
            real: item.real
          })))
        )
      )
    ),
    { initialValue: [] as GastoViewItem[] }
  );

  readonly totalReal = computed(() =>
    this.gastos().reduce((sum, gasto) => sum + gasto.real, 0)
  );

  readonly totalPresupuestado = computed(() =>
    this.gastos().reduce((sum, gasto) => sum + gasto.presupuestado, 0)
  );

  readonly progresoTotal = computed(() => {
    const presupuestado = this.totalPresupuestado();
    if (presupuestado === 0) return 0;
    return Math.min((this.totalReal() / presupuestado) * 100, 100);
  });

  readonly totalExcedido = computed(() =>
    this.totalReal() > this.totalPresupuestado()
  );

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

  diferencia(gasto: GastoViewItem): number {
    return gasto.real - gasto.presupuestado;
  }

  isGastoExcedido(gasto: GastoViewItem): boolean {
    return gasto.real > gasto.presupuestado;
  }

  openDialog(): void {
    this.nuevoNombre.set('');
    this.nuevoGastoImporte.set(null);
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  async guardarGasto(): Promise<void> {
    const monthId = this.currentMonthId();
    const user = this.authService.currentUser;
    const nombre = this.nuevoNombre().trim();
    const importe = this.nuevoGastoImporte();

    if (!monthId || !user || !nombre || importe === null || importe <= 0) return;

    try {
      await this.sectionService.gastos.add({
        month_id: monthId,
        user_id: user.uid,
        name: nombre,
        presupuestado: importe,
        real: 0,
        tipo: 'variables',
        order_index: this.gastos().length
      });
      this.closeDialog();
    } catch (error) {
      console.error('Error al guardar gasto:', error);
    }
  }
}
