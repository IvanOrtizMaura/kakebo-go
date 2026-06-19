import { Component, signal, computed, inject, effect } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Router } from '@angular/router';
import { Firestore, collection, getDocs, query, where } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { BottomNavComponent } from '../../layout/bottom-nav/bottom-nav.component';
import { AuthService } from '../../core/auth/auth.service';
import { MONTH_NAMES } from '../../shared/constants/months';

export type EstadoMes = 'cerrado' | 'en-curso' | 'pendiente';

export interface ResumenMes {
  nombre: string;
  estado: EstadoMes;
  ahorro: number;
  presupuestado: number;
  gastado: number;
}

export interface BarraMes {
  nombre: string;
  inicial: string;
  ahorro: number;
  estado: EstadoMes;
  alturaPixeles: number;
  color: string;
  indice: number;
}

const INICIALES_MESES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const ALTURA_MAXIMA_BARRA = 72;
const COLOR_VERDE = '#22c55e';
const COLOR_ROJO = '#ef4444';
const COLOR_GRIS = '#e2e8f0';
const COLOR_AZUL = '#3b82f6';

function buildPendingYear(): ResumenMes[] {
  return MONTH_NAMES.map(nombre => ({ nombre, estado: 'pendiente' as EstadoMes, ahorro: 0, presupuestado: 0, gastado: 0 }));
}

@Component({
  selector: 'app-resumen-anual',
  standalone: true,
  imports: [CurrencyPipe, BottomNavComponent],
  templateUrl: './resumen-anual.component.html',
  styleUrl: './resumen-anual.component.scss'
})
export class ResumenAnualComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  readonly mesActual = new Date().getMonth();

  readonly anio = signal<number>(new Date().getFullYear());

  readonly loading = signal<boolean>(false);

  readonly meses = signal<ResumenMes[]>(buildPendingYear());

  readonly ahorroTotal = computed(() =>
    this.meses().reduce((suma, mes) => suma + mes.ahorro, 0)
  );

  readonly ingresosTotal = computed(() =>
    this.meses()
      .filter(mes => mes.estado !== 'pendiente')
      .reduce((suma, mes) => suma + mes.gastado + mes.ahorro, 0)
  );

  readonly gastosTotal = computed(() =>
    this.meses()
      .filter(mes => mes.estado !== 'pendiente')
      .reduce((suma, mes) => suma + mes.gastado, 0)
  );

  readonly barras = computed<BarraMes[]>(() => {
    const listaMeses = this.meses();
    const ahorrosAbsolutos = listaMeses.map(mes => Math.abs(mes.ahorro));
    const valorMaximo = Math.max(...ahorrosAbsolutos, 1);

    return listaMeses.map((mes, indice) => {
      const alturaPixeles = mes.estado === 'pendiente'
        ? 8
        : Math.max(Math.round((Math.abs(mes.ahorro) / valorMaximo) * ALTURA_MAXIMA_BARRA), 6);

      let color: string;
      if (mes.estado === 'pendiente') {
        color = COLOR_GRIS;
      } else if (indice === this.mesActual) {
        color = COLOR_AZUL;
      } else if (mes.ahorro >= 0) {
        color = COLOR_VERDE;
      } else {
        color = COLOR_ROJO;
      }

      return {
        nombre: mes.nombre,
        inicial: INICIALES_MESES[indice],
        ahorro: mes.ahorro,
        estado: mes.estado,
        alturaPixeles,
        color,
        indice
      };
    });
  });

  constructor() {
    effect(() => {
      const year = this.anio();
      this.loadYear(year);
    });
  }

  private async loadYear(year: number): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;

    this.loading.set(true);
    this.meses.set(buildPendingYear());

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-based

    // Get all month docs for this year (no orderBy to avoid composite index requirement)
    const monthsSnap = await getDocs(
      query(collection(this.firestore, 'users', uid, 'months'), where('year', '==', year))
    );
    const existingMonths = monthsSnap.docs.map(d => ({ id: d.id, ...(d.data() as { month: number; year: number }) }));

    const results: ResumenMes[] = await Promise.all(
      MONTH_NAMES.map(async (nombre, idx) => {
        const monthNumber = idx + 1; // 1-based
        const monthDoc = existingMonths.find(m => m.month === monthNumber);

        let estado: EstadoMes;
        if (year < currentYear || (year === currentYear && monthNumber < currentMonth)) {
          estado = 'cerrado';
        } else if (year === currentYear && monthNumber === currentMonth) {
          estado = 'en-curso';
        } else {
          estado = 'pendiente';
        }

        if (!monthDoc || estado === 'pendiente') {
          return { nombre, estado, ahorro: 0, presupuestado: 0, gastado: 0 };
        }

        const monthId = monthDoc.id;

        // Load all sections in parallel using getDocs (no injection context issues)
        const [ingSnap, facSnap, gasSnap, ahoSnap] = await Promise.all([
          getDocs(collection(this.firestore, 'users', uid, 'months', monthId, 'ingresos')),
          getDocs(collection(this.firestore, 'users', uid, 'months', monthId, 'facturas')),
          getDocs(collection(this.firestore, 'users', uid, 'months', monthId, 'gastos')),
          getDocs(collection(this.firestore, 'users', uid, 'months', monthId, 'ahorros')),
        ]);

        const sum = (snap: typeof ingSnap, field: string) =>
          snap.docs.reduce((s, d) => s + ((d.data()[field] as number) ?? 0), 0);

        const totalIngresos = sum(ingSnap, 'real');
        const totalFacturas = sum(facSnap, 'real');
        const totalGastos = sum(gasSnap, 'real');
        const totalAhorros = sum(ahoSnap, 'real');
        const presupuestado = sum(ingSnap, 'esperado');

        const gastado = totalFacturas + totalGastos + totalAhorros;
        const balance = totalIngresos - gastado;

        return { nombre, estado, ahorro: balance, presupuestado, gastado };
      })
    );

    this.meses.set(results);
    this.loading.set(false);
  }

  navegarAtras(): void {
    this.router.navigate(['/mas']);
  }

  navegarAnioAnterior(): void {
    this.anio.update(anioActual => anioActual - 1);
  }

  navegarAnioSiguiente(): void {
    this.anio.update(anioActual => anioActual + 1);
  }

  navegarAlMes(indice: number): void {
    const year = this.anio();
    const month = indice;
    this.router.navigate(['/home'], { queryParams: { year, month } });
  }

  calcularPorcentajeProgreso(gastado: number, presupuestado: number): number {
    if (presupuestado === 0) return 0;
    return Math.min(Math.round((gastado / presupuestado) * 100), 100);
  }
}
