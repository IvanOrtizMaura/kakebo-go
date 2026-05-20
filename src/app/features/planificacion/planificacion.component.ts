import { Component, signal, computed, effect, inject, OnInit } from '@angular/core';
import { CurrencyPipe, LowerCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DatePicker } from 'primeng/datepicker';
import { AuthService } from '../../core/auth/auth.service';
import { MonthService } from '../../shared/services/month.service';
import { IngresosService } from '../../shared/services/ingresos.service';
import { FacturasService } from '../../shared/services/facturas.service';
import { SectionService } from '../../shared/services/section.service';
import { DeudasService } from '../../shared/services/deudas.service';
import { Ingreso, Factura, Deuda } from '../../shared/models';

export interface PlanItem {
  id: string;
  firestoreId?: string;
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
export class PlanificacionComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly monthService = inject(MonthService);
  private readonly ingresosService = inject(IngresosService);
  private readonly facturasService = inject(FacturasService);
  private readonly sectionService = inject(SectionService);
  private readonly deudasService = inject(DeudasService);

  readonly mesNombre = `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`;
  readonly pasos = PASOS;

  readonly pasoActual = signal<number>(1);
  readonly guardando = signal<boolean>(false);
  readonly cargando = signal<boolean>(true);

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

  async ngOnInit(): Promise<void> {
    await this.cargarDatosExistentes();
  }

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

  async guardar(): Promise<void> {
    const uid = this.authService.currentUser?.uid;
    if (!uid || this.guardando()) return;

    this.guardando.set(true);

    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonthNumber = now.getMonth() + 1;

      const month = await this.monthService.getOrCreateMonth(uid, currentYear, currentMonthNumber);
      const monthId = month.id;

      const newIngresos = this.ingresos().filter(item => !item.firestoreId);
      const newFacturas = this.facturas().filter(item => !item.firestoreId);
      const newGastos = this.gastos().filter(item => !item.firestoreId);
      const newAhorros = this.ahorros().filter(item => !item.firestoreId);
      const newDeudas = this.deudas().filter(item => !item.firestoreId);

      const existingIngresosCount = this.ingresos().filter(item => !!item.firestoreId).length;
      const existingFacturasCount = this.facturas().filter(item => !!item.firestoreId).length;
      const existingGastosCount = this.gastos().filter(item => !!item.firestoreId).length;
      const existingAhorrosCount = this.ahorros().filter(item => !!item.firestoreId).length;

      await Promise.all([
        ...newIngresos.map((item, index) =>
          this.ingresosService.add({
            month_id: monthId,
            user_id: uid,
            fuente: item.nombre,
            esperado: item.presupuestado,
            dia_de_paga: item.dia ?? null,
            real: 0,
            depositado: false,
            order_index: existingIngresosCount + index
          })
        ),
        ...newFacturas.map((item, index) =>
          this.facturasService.add({
            month_id: monthId,
            user_id: uid,
            name: item.nombre,
            presupuestado: item.presupuestado,
            fecha: item.dia ?? null,
            real: 0,
            is_recurring: false,
            order_index: existingFacturasCount + index
          })
        ),
        ...newGastos.map((item, index) =>
          this.sectionService.gastos.add({
            month_id: monthId,
            user_id: uid,
            name: item.nombre,
            presupuestado: item.presupuestado,
            real: 0,
            tipo: 'variables',
            order_index: existingGastosCount + index
          })
        ),
        ...newAhorros.map((item, index) =>
          this.sectionService.ahorros.add({
            month_id: monthId,
            user_id: uid,
            name: item.nombre,
            presupuestado: item.presupuestado,
            real: 0,
            order_index: existingAhorrosCount + index
          })
        ),
        ...newDeudas.map(item =>
          this.deudasService.create({
            user_id: uid,
            name: item.nombre,
            type: 'bank',
            principal_amount: item.presupuestado,
            total_amount: item.presupuestado,
            interest_rate: 0,
            monthly_payment: item.presupuestado,
            amount_remaining: item.presupuestado,
            is_active: true
          })
        )
      ]);

      await this.router.navigate(['/home']);
    } catch (error) {
      console.error('Error guardando planificación:', error);
    } finally {
      this.guardando.set(false);
    }
  }

  cerrar(): void {
    this.router.navigate(['/home']);
  }

  private async cargarDatosExistentes(): Promise<void> {
    const uid = this.authService.currentUser?.uid;
    if (!uid) {
      this.cargando.set(false);
      return;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNumber = now.getMonth() + 1;

    try {
      const months = await this.monthService.getMonthsForYear(uid, currentYear);
      const existingMonth = months.find(m => m.month === currentMonthNumber) ?? null;

      if (!existingMonth) {
        this.cargando.set(false);
        return;
      }

      const monthId = existingMonth.id;

      const [ingresosData, facturasData, gastosData, ahorrosData, deudasData] = await Promise.all([
        this.ingresosService.getByMonth(monthId),
        this.facturasService.getByMonth(monthId),
        this.sectionService.gastos.getByMonth(monthId),
        this.sectionService.ahorros.getByMonth(monthId),
        this.deudasService.getActive(uid)
      ]);

      this.ingresos.set(ingresosData.map((ingreso: Ingreso) => ({
        id: ingreso.id,
        firestoreId: ingreso.id,
        nombre: ingreso.fuente,
        presupuestado: ingreso.esperado,
        dia: ingreso.dia_de_paga ?? undefined
      })));

      this.facturas.set(facturasData.map((factura: Factura) => ({
        id: factura.id,
        firestoreId: factura.id,
        nombre: factura.name,
        presupuestado: factura.presupuestado,
        dia: factura.fecha ?? undefined
      })));

      this.gastos.set(gastosData.map((gasto: Record<string, unknown>) => ({
        id: gasto['id'] as string,
        firestoreId: gasto['id'] as string,
        nombre: gasto['name'] as string,
        presupuestado: gasto['presupuestado'] as number
      })));

      this.ahorros.set(ahorrosData.map((ahorro: Record<string, unknown>) => ({
        id: ahorro['id'] as string,
        firestoreId: ahorro['id'] as string,
        nombre: ahorro['name'] as string,
        presupuestado: ahorro['presupuestado'] as number
      })));

      this.deudas.set(deudasData.map((deuda: Deuda) => ({
        id: deuda.id,
        firestoreId: deuda.id,
        nombre: deuda.name,
        presupuestado: deuda.monthly_payment
      })));
    } catch {
      // Si falla la carga, el stepper arranca vacío sin bloquear al usuario
    } finally {
      this.cargando.set(false);
    }
  }
}
