import { Component, signal, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Dialog } from 'primeng/dialog';
import { Select } from 'primeng/select';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';

interface SectionBudget {
  nombre: string;
  icono: string;
  color: string;
  presupuestado: number;
  real: number;
}

interface DonutSegment {
  label: string;
  value: number;
  color: string;
  strokeDasharray: string;
  strokeDashoffset: number;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DONUT_RADIUS = 45;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, Dialog, Select, BottomNavComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  private readonly router = inject(Router);
  private readonly baseYear = new Date().getFullYear();
  private readonly baseMonthIndex = new Date().getMonth();

  private readonly monthOffset = signal(0);

  readonly currentMonthIndex = computed(() => {
    const rawIndex = this.baseMonthIndex + this.monthOffset();
    return ((rawIndex % 12) + 12) % 12;
  });

  readonly currentYear = computed(() => {
    const rawIndex = this.baseMonthIndex + this.monthOffset();
    return this.baseYear + Math.floor(rawIndex / 12);
  });

  readonly mesNombre = computed(
    () => `${MONTH_NAMES[this.currentMonthIndex()]} ${this.currentYear()}`
  );

  readonly ingresos = signal(2450);
  readonly gastos = signal(1890);
  readonly disponible = computed(() => this.ingresos() - this.gastos());
  readonly ahorro = signal(200);

  readonly secciones = signal<SectionBudget[]>([
    { nombre: 'Ingresos',  icono: 'pi-arrow-up-right', color: '#8b5cf6', presupuestado: 2450, real: 2450 },
    { nombre: 'Facturas',  icono: 'pi-file',            color: '#3b82f6', presupuestado: 800,  real: 780  },
    { nombre: 'Gastos',    icono: 'pi-shopping-cart',   color: '#ef4444', presupuestado: 600,  real: 650  },
    { nombre: 'Ahorros',   icono: 'pi-wallet',          color: '#22c55e', presupuestado: 300,  real: 200  },
    { nombre: 'Deudas',    icono: 'pi-credit-card',     color: '#f59e0b', presupuestado: 400,  real: 260  },
  ]);

  readonly donutSegments = computed((): DonutSegment[] => {
    const items = this.secciones();
    const total = items.reduce((sum, section) => sum + section.real, 0);

    if (total === 0) return [];

    let cumulativeLength = 0;

    return items.map((section) => {
      const segmentLength = (section.real / total) * DONUT_CIRCUMFERENCE;
      const dashOffset = -cumulativeLength;
      cumulativeLength += segmentLength;

      return {
        label: section.nombre,
        value: section.real,
        color: section.color,
        strokeDasharray: `${segmentLength.toFixed(2)} ${DONUT_CIRCUMFERENCE.toFixed(2)}`,
        strokeDashoffset: dashOffset
      };
    });
  });

  readonly totalGastos = computed(() =>
    this.secciones().reduce((sum, section) => sum + section.real, 0)
  );

  readonly nuevoGastoDialogVisible = signal(false);
  readonly nuevoGastoNombre = signal('');
  readonly nuevoGastoCategoria = signal<string>('');
  readonly nuevoGastoImporte = signal<number | null>(null);
  readonly categorias = ['Ingresos', 'Facturas', 'Gastos', 'Deudas', 'Ahorros'];

  navigateToPreviousMonth(): void {
    this.monthOffset.update(offset => offset - 1);
  }

  navigateToNextMonth(): void {
    this.monthOffset.update(offset => offset + 1);
  }

  sectionProgressPercentage(section: SectionBudget): number {
    if (section.presupuestado === 0) return 0;
    return Math.min((section.real / section.presupuestado) * 100, 100);
  }

  isSectionExceeded(section: SectionBudget): boolean {
    return section.real > section.presupuestado;
  }

  onAjustarPresupuestoClick(): void {
    this.router.navigate(['/planificacion']);
  }

  openNuevoGastoDialog(): void {
    this.nuevoGastoNombre.set('');
    this.nuevoGastoCategoria.set('');
    this.nuevoGastoImporte.set(null);
    this.nuevoGastoDialogVisible.set(true);
  }

  closeNuevoGastoDialog(): void {
    this.nuevoGastoDialogVisible.set(false);
  }

  saveNuevoGasto(): void {
    console.log({
      nombre: this.nuevoGastoNombre(),
      categoria: this.nuevoGastoCategoria(),
      importe: this.nuevoGastoImporte()
    });
    this.closeNuevoGastoDialog();
  }
}
