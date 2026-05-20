import { Component, signal, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { Dialog } from 'primeng/dialog';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { filter, switchMap, map } from 'rxjs';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';
import { AuthService } from '../../../core/auth/auth.service';
import { MonthService } from '../../../shared/services/month.service';
import { SectionService } from '../../../shared/services/section.service';
import { Ahorro } from '../../../shared/models';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface AhorroViewItem {
  id: string;
  nombre: string;
  presupuestado: number;
  real: number;
  mesActual: number;
  totalMeses: number;
  objetivo: number;
}

@Component({
  selector: 'app-ahorros',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, BottomNavComponent],
  templateUrl: './ahorros.component.html',
  styleUrl: './ahorros.component.scss'
})
export class AhorrosComponent {
  private readonly location = inject(Location);
  private readonly authService = inject(AuthService);
  private readonly monthService = inject(MonthService);
  private readonly sectionService = inject(SectionService);

  readonly mesNombre = `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`;

  private readonly currentMonthId = signal<string | null>(null);

  readonly ahorros = toSignal(
    toObservable(this.currentMonthId).pipe(
      filter((id): id is string => id !== null),
      switchMap(id =>
        (this.sectionService.ahorros.getAll(id) as ReturnType<typeof this.sectionService.ahorros.getAll>).pipe(
          map(items => (items as unknown as Ahorro[]).map((item): AhorroViewItem => ({
            id: item.id,
            nombre: item.name,
            presupuestado: item.presupuestado,
            real: item.real,
            mesActual: 0,
            totalMeses: 0,
            objetivo: 0
          })))
        )
      )
    ),
    { initialValue: [] as AhorroViewItem[] }
  );

  readonly totalReal = computed(() =>
    this.ahorros().reduce((sum, ahorro) => sum + ahorro.real, 0)
  );

  readonly totalPresupuestado = computed(() =>
    this.ahorros().reduce((sum, ahorro) => sum + ahorro.presupuestado, 0)
  );

  readonly progresoTotal = computed(() => {
    const presupuestado = this.totalPresupuestado();
    if (presupuestado === 0) return 0;
    return Math.min((this.totalReal() / presupuestado) * 100, 100);
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

  navigateBack(): void {
    this.location.back();
  }

  fondoProgresoPorcentaje(ahorro: AhorroViewItem): number {
    if (ahorro.totalMeses === 0) return 0;
    return Math.min((ahorro.mesActual / ahorro.totalMeses) * 100, 100);
  }

  openDialog(): void {
    this.nuevoNombre.set('');
    this.nuevoGastoImporte.set(null);
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  async guardarAhorro(): Promise<void> {
    const monthId = this.currentMonthId();
    const user = this.authService.currentUser;
    const nombre = this.nuevoNombre().trim();
    const importe = this.nuevoGastoImporte();

    if (!monthId || !user || !nombre || importe === null || importe <= 0) return;

    try {
      await this.sectionService.ahorros.add({
        month_id: monthId,
        user_id: user.uid,
        name: nombre,
        presupuestado: importe,
        real: 0,
        order_index: this.ahorros().length
      });
      this.closeDialog();
    } catch (error) {
      console.error('Error al guardar ahorro:', error);
    }
  }
}
