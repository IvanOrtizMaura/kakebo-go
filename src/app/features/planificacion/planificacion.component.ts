import { Component, signal, computed, effect, inject } from '@angular/core';
import { CurrencyPipe, LowerCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DatePicker } from 'primeng/datepicker';

export interface PlanItem {
  id: string;
  nombre: string;
  presupuestado: number;
  dia?: string;
}

interface PasoConfig {
  numero: number;
  label: string;
  subtitulo: string;
  placeholderNombre: string;
  colorClass: string;
  mostrarDia: boolean;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const PASOS: PasoConfig[] = [
  { numero: 1, label: 'Ingresos',  subtitulo: '¿Cuánto esperas ingresar este mes?',  placeholderNombre: 'Ej: Nómina',              colorClass: 'step--green',  mostrarDia: true  },
  { numero: 2, label: 'Facturas',  subtitulo: '¿Qué facturas tienes este mes?',       placeholderNombre: 'Ej: Alquiler',            colorClass: 'step--blue',   mostrarDia: true  },
  { numero: 3, label: 'Gastos',    subtitulo: '¿Cuánto planeas gastar?',              placeholderNombre: 'Ej: Supermercado',         colorClass: 'step--red',    mostrarDia: false },
  { numero: 4, label: 'Ahorros',   subtitulo: '¿Cuánto quieres ahorrar?',            placeholderNombre: 'Ej: Fondo emergencias',    colorClass: 'step--green',  mostrarDia: false },
  { numero: 5, label: 'Deudas',    subtitulo: '¿Tienes deudas que pagar este mes?',  placeholderNombre: 'Ej: Préstamo personal',   colorClass: 'step--amber',  mostrarDia: false },
];

@Component({
  selector: 'app-planificacion',
  standalone: true,
  imports: [CurrencyPipe, LowerCasePipe, FormsModule, DatePicker],
  templateUrl: './planificacion.component.html',
  styleUrl: './planificacion.component.scss'
})
export class PlanificacionComponent {
  private readonly router = inject(Router);

  readonly mesNombre = `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`;
  readonly pasos = PASOS;

  readonly pasoActual = signal<number>(1);

  readonly ingresos = signal<PlanItem[]>([]);
  readonly facturas = signal<PlanItem[]>([]);
  readonly gastos = signal<PlanItem[]>([]);
  readonly ahorros = signal<PlanItem[]>([]);
  readonly deudas = signal<PlanItem[]>([]);

  readonly mostrarFormulario = signal<boolean>(false);
  readonly nuevoNombre = signal<string>('');
  readonly nuevoPresupuestado = signal<number | null>(null);
  readonly nuevoDia = signal<Date | null>(null);

  readonly totalIngresos = computed(() => this.ingresos().reduce((sum, item) => sum + item.presupuestado, 0));
  readonly totalFacturas = computed(() => this.facturas().reduce((sum, item) => sum + item.presupuestado, 0));
  readonly totalGastos = computed(() => this.gastos().reduce((sum, item) => sum + item.presupuestado, 0));
  readonly totalAhorros = computed(() => this.ahorros().reduce((sum, item) => sum + item.presupuestado, 0));
  readonly totalDeudas = computed(() => this.deudas().reduce((sum, item) => sum + item.presupuestado, 0));

  readonly pasoActualConfig = computed(() => PASOS[this.pasoActual() - 1]);

  readonly itemsPasoActual = computed((): PlanItem[] => {
    switch (this.pasoActual()) {
      case 1: return this.ingresos();
      case 2: return this.facturas();
      case 3: return this.gastos();
      case 4: return this.ahorros();
      case 5: return this.deudas();
      default: return [];
    }
  });

  readonly totalPasoActual = computed((): number => {
    switch (this.pasoActual()) {
      case 1: return this.totalIngresos();
      case 2: return this.totalFacturas();
      case 3: return this.totalGastos();
      case 4: return this.totalAhorros();
      case 5: return this.totalDeudas();
      default: return 0;
    }
  });

  readonly esUltimoPaso = computed(() => this.pasoActual() === 5);

  readonly resetFormularioEffect = effect(() => {
    this.pasoActual();
    this.mostrarFormulario.set(false);
    this.nuevoNombre.set('');
    this.nuevoPresupuestado.set(null);
    this.nuevoDia.set(null);
  });

  pasoEsCompletado(numeroPaso: number): boolean {
    return numeroPaso < this.pasoActual();
  }

  pasoEsActivo(numeroPaso: number): boolean {
    return numeroPaso === this.pasoActual();
  }

  abrirFormulario(): void {
    this.nuevoNombre.set('');
    this.nuevoPresupuestado.set(null);
    this.nuevoDia.set(null);
    this.mostrarFormulario.set(true);
  }

  cancelarFormulario(): void {
    this.mostrarFormulario.set(false);
    this.nuevoNombre.set('');
    this.nuevoPresupuestado.set(null);
    this.nuevoDia.set(null);
  }

  confirmarItem(): void {
    const nombre = this.nuevoNombre().trim();
    const presupuestado = this.nuevoPresupuestado() ?? 0;

    if (!nombre || presupuestado <= 0) return;

    const nuevoItem: PlanItem = {
      id: crypto.randomUUID(),
      nombre,
      presupuestado,
      dia: this.nuevoDia()?.getDate().toString()
    };

    switch (this.pasoActual()) {
      case 1: this.ingresos.update(items => [...items, nuevoItem]); break;
      case 2: this.facturas.update(items => [...items, nuevoItem]); break;
      case 3: this.gastos.update(items => [...items, nuevoItem]); break;
      case 4: this.ahorros.update(items => [...items, nuevoItem]); break;
      case 5: this.deudas.update(items => [...items, nuevoItem]); break;
    }

    this.mostrarFormulario.set(false);
    this.nuevoNombre.set('');
    this.nuevoPresupuestado.set(null);
    this.nuevoDia.set(null);
  }

  avanzarPaso(): void {
    if (this.pasoActual() < 5) {
      this.pasoActual.update(paso => paso + 1);
    }
  }

  retrocederPaso(): void {
    if (this.pasoActual() > 1) {
      this.pasoActual.update(paso => paso - 1);
    }
  }

  guardar(): void {
    console.log({
      ingresos: this.ingresos(),
      facturas: this.facturas(),
      gastos: this.gastos(),
      ahorros: this.ahorros(),
      deudas: this.deudas(),
      totales: {
        ingresos: this.totalIngresos(),
        facturas: this.totalFacturas(),
        gastos: this.totalGastos(),
        ahorros: this.totalAhorros(),
        deudas: this.totalDeudas()
      }
    });
    this.router.navigate(['/home']);
  }

  cerrar(): void {
    this.router.navigate(['/home']);
  }
}
