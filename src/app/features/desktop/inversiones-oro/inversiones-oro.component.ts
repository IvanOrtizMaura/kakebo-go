import { Component, signal, computed, inject, OnDestroy } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { InversionesService } from '../../../shared/services/inversiones.service';
import { GoldPriceService } from '../../../shared/services/gold-price.service';
import { GoldPriceHistoryService } from '../../../shared/services/gold-price-history.service';
import { InversionOro } from '../../../shared/models';

type FormatoOro = 'Lingote' | 'Moneda' | 'Joyería';

interface PriceHistoryPoint {
  month: number;
  year: number;
  price: number;
}

interface ChartPoint {
  x: number;
  y: number;
  label: string;
  price: number;
}

interface RepartoFormato {
  formato: FormatoOro;
  totalGrams: number;
  percentage: number;
  currentValue: number;
  color: string;
}

interface TableRow {
  id: string;
  fechaLabel: string;
  fechaTimestamp: number;
  formato: FormatoOro;
  pieza: string;
  peso: number;
  precioG: number;
  invertido: number;
  valorHoy: number;
  resultado: number;
}

const CHART_WIDTH = 640;
const CHART_HEIGHT = 220;
const CHART_PADDING_LEFT = 44;
const CHART_PADDING_RIGHT = 20;
const CHART_PADDING_TOP = 20;
const CHART_PADDING_BOTTOM = 32;

const FORMATO_COLORS: Record<FormatoOro, string> = {
  Lingote: 'rgb(247, 148, 29)',
  Moneda: 'rgb(0, 107, 170)',
  'Joyería': 'rgb(152, 113, 187)'
};

const FORMATO_OPTIONS: readonly FormatoOro[] = ['Lingote', 'Moneda', 'Joyería'];

const MONTH_SHORT_LABELS: readonly string[] = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
];

@Component({
  selector: 'app-inversiones-oro',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, FormsModule],
  templateUrl: './inversiones-oro.component.html',
  styleUrl: './inversiones-oro.component.scss'
})
export class InversionesOroComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly inversionesService = inject(InversionesService);
  private readonly goldPriceService = inject(GoldPriceService);
  private readonly goldPriceHistoryService = inject(GoldPriceHistoryService);

  private subs: Subscription[] = [];

  readonly chartWidth = CHART_WIDTH;
  readonly chartHeight = CHART_HEIGHT;
  readonly formatoOptions = FORMATO_OPTIONS;

  readonly inversiones = signal<InversionOro[]>([]);
  readonly spotPrice = signal<number | null>(null);
  readonly spotUpdatedAt = signal<Date | null>(null);
  readonly priceHistory = signal<PriceHistoryPoint[]>([]);
  readonly loadingSpot = signal(true);

  readonly searchTerm = signal('');
  readonly dialogVisible = signal(false);
  readonly saving = signal(false);

  readonly newCompraFecha = signal<string>(this.toDateInputValue(new Date()));
  readonly newCompraFormato = signal<FormatoOro>('Lingote');
  readonly newCompraPieza = signal<string>('');
  readonly newCompraGramos = signal<number | null>(null);
  readonly newCompraPrecio = signal<number | null>(null);

  readonly totalGrams = computed(() =>
    this.inversiones().reduce((sum, item) => sum + (item.gramos || 0), 0)
  );

  readonly totalInvertido = computed(() =>
    this.inversiones().reduce((sum, item) => sum + (item.precio_compra || 0), 0)
  );

  readonly totalPurchases = computed(() => this.inversiones().length);

  readonly avgPricePerGram = computed(() => {
    const grams = this.totalGrams();
    return grams > 0 ? this.totalInvertido() / grams : 0;
  });

  readonly valorActual = computed<number | null>(() => {
    const price = this.spotPrice();
    if (price === null) return null;
    return this.totalGrams() * price;
  });

  readonly gananciaLatente = computed<number | null>(() => {
    const actual = this.valorActual();
    if (actual === null) return null;
    return actual - this.totalInvertido();
  });

  readonly gananciaPercent = computed<number>(() => {
    const invertido = this.totalInvertido();
    const ganancia = this.gananciaLatente();
    if (invertido <= 0 || ganancia === null) return 0;
    return (ganancia / invertido) * 100;
  });

  readonly spotUpdatedLabel = computed<string | null>(() => {
    const date = this.spotUpdatedAt();
    if (!date) return null;
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  });

  readonly repartoFormato = computed<RepartoFormato[]>(() => {
    const items = this.inversiones();
    if (items.length === 0) return [];

    const grouped: Record<FormatoOro, number> = {
      Lingote: 0,
      Moneda: 0,
      'Joyería': 0
    };

    for (const item of items) {
      const formato: FormatoOro = item.formato ?? 'Lingote';
      grouped[formato] += item.gramos || 0;
    }

    const total = this.totalGrams();
    const price = this.spotPrice();

    return (Object.keys(grouped) as FormatoOro[])
      .filter(formato => grouped[formato] > 0)
      .map(formato => ({
        formato,
        totalGrams: grouped[formato],
        percentage: total > 0 ? (grouped[formato] / total) * 100 : 0,
        currentValue: price !== null ? grouped[formato] * price : 0,
        color: FORMATO_COLORS[formato]
      }))
      .sort((a, b) => b.totalGrams - a.totalGrams);
  });

  readonly tableRows = computed<TableRow[]>(() => {
    const price = this.spotPrice() ?? 0;
    const items = this.inversiones();
    const rows: TableRow[] = items.map(item => {
      const fechaDate = this.parseFecha(item.fechaCompra, item.created_at);
      const formato: FormatoOro = item.formato ?? 'Lingote';
      const invertido = item.precio_compra || 0;
      const peso = item.gramos || 0;
      const precioG = peso > 0 ? invertido / peso : 0;
      const valorHoy = peso * price;
      return {
        id: item.id,
        fechaLabel: this.formatFecha(fechaDate),
        fechaTimestamp: fechaDate.getTime(),
        formato,
        pieza: item.pieza ?? item.name,
        peso,
        precioG,
        invertido,
        valorHoy,
        resultado: valorHoy - invertido
      };
    });

    rows.sort((a, b) => b.fechaTimestamp - a.fechaTimestamp);

    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(row =>
      row.pieza.toLowerCase().includes(term) ||
      row.formato.toLowerCase().includes(term)
    );
  });

  readonly resultadoTotal = computed<number>(() => {
    const price = this.spotPrice() ?? 0;
    return this.inversiones().reduce((sum, item) => {
      const peso = item.gramos || 0;
      const valorHoy = peso * price;
      return sum + (valorHoy - (item.precio_compra || 0));
    }, 0);
  });

  readonly hasEnoughHistory = computed(() => this.priceHistory().length >= 2);

  readonly chartPoints = computed<ChartPoint[]>(() => {
    const history = this.priceHistory();
    if (history.length < 2) return [];

    const prices = history.map(item => item.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 1;

    const usableWidth = CHART_WIDTH - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
    const usableHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
    const stepX = history.length > 1 ? usableWidth / (history.length - 1) : 0;

    return history.map((point, index) => {
      const x = CHART_PADDING_LEFT + index * stepX;
      const normalized = (point.price - minPrice) / range;
      const y = CHART_PADDING_TOP + usableHeight - normalized * usableHeight;
      return {
        x,
        y,
        label: `${MONTH_SHORT_LABELS[point.month - 1]} ${String(point.year).slice(2)}`,
        price: point.price
      };
    });
  });

  readonly chartPolyline = computed<string>(() =>
    this.chartPoints().map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
  );

  readonly chartAreaPath = computed<string>(() => {
    const points = this.chartPoints();
    if (points.length < 2) return '';
    const baseY = CHART_HEIGHT - CHART_PADDING_BOTTOM;
    const start = `M ${points[0].x.toFixed(2)} ${baseY.toFixed(2)}`;
    const line = points.map(point => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    const lastX = points[points.length - 1].x;
    const end = `L ${lastX.toFixed(2)} ${baseY.toFixed(2)} Z`;
    return `${start} ${line} ${end}`;
  });

  readonly yAxisLabels = computed<{ value: number; y: number }[]>(() => {
    const history = this.priceHistory();
    if (history.length < 2) return [];
    const prices = history.map(item => item.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const usableHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
    const ticks = 4;
    return Array.from({ length: ticks }, (_, i) => {
      const t = i / (ticks - 1);
      const value = minPrice + (maxPrice - minPrice) * (1 - t);
      const y = CHART_PADDING_TOP + t * usableHeight;
      return { value, y };
    });
  });

  readonly xAxisLabels = computed<{ label: string; x: number }[]>(() => {
    const points = this.chartPoints();
    if (points.length < 2) return [];
    const step = Math.max(1, Math.floor(points.length / 5));
    const labels: { label: string; x: number }[] = [];
    for (let index = 0; index < points.length; index += step) {
      labels.push({ label: points[index].label, x: points[index].x });
    }
    const last = points[points.length - 1];
    if (labels[labels.length - 1]?.label !== last.label) {
      labels.push({ label: last.label, x: last.x });
    }
    return labels;
  });

  readonly lastChartPoint = computed<ChartPoint | null>(() => {
    const points = this.chartPoints();
    return points.length > 0 ? points[points.length - 1] : null;
  });

  readonly canSubmitCompra = computed(() => {
    const gramos = this.newCompraGramos();
    const precio = this.newCompraPrecio();
    const pieza = this.newCompraPieza().trim();
    return (
      pieza.length > 0 &&
      gramos !== null && gramos > 0 &&
      precio !== null && precio > 0
    );
  });

  constructor() {
    this.subs.push(
      this.inversionesService.getAll().subscribe(items => this.inversiones.set(items))
    );

    const cached = this.goldPriceService.getLastUpdated();
    if (cached) {
      this.spotUpdatedAt.set(cached.date);
    }

    void this.loadGoldPrice();
    void this.loadPriceHistory();
  }

  ngOnDestroy(): void {
    this.subs.forEach(subscription => subscription.unsubscribe());
  }

  private async loadGoldPrice(): Promise<void> {
    this.loadingSpot.set(true);
    const before = this.goldPriceService.getLastUpdated();
    try {
      const price = await this.goldPriceService.getGoldPriceEurPerGram();
      if (price !== null) {
        this.spotPrice.set(price);
        const after = this.goldPriceService.getLastUpdated();
        if (after) {
          this.spotUpdatedAt.set(after.date);
          const isNewFetch = !before || after.date.getTime() !== before.date.getTime();
          const user = this.authService.currentUser;
          if (isNewFetch && user) {
            await this.goldPriceHistoryService.savePriceSnapshot(user.uid, price);
            await this.loadPriceHistory();
          }
        }
      }
    } catch (error) {
      console.error('Error obteniendo precio del oro:', error);
    } finally {
      this.loadingSpot.set(false);
    }
  }

  private async loadPriceHistory(): Promise<void> {
    const user = this.authService.currentUser;
    if (!user) return;
    try {
      const history = await this.goldPriceHistoryService.getLast12Months(user.uid);
      this.priceHistory.set(history);
    } catch (error) {
      console.error('Error cargando historial de oro:', error);
    }
  }

  private parseFecha(fechaCompra: Date | undefined, createdAt: string): Date {
    if (fechaCompra) {
      if (fechaCompra instanceof Date) return fechaCompra;
      const anyDate = fechaCompra as unknown as { seconds?: number; toDate?: () => Date };
      if (typeof anyDate.toDate === 'function') return anyDate.toDate();
      if (typeof anyDate.seconds === 'number') return new Date(anyDate.seconds * 1000);
      const parsed = new Date(fechaCompra as unknown as string);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date(createdAt);
  }

  private formatFecha(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatoBadgeClass(formato: FormatoOro): string {
    switch (formato) {
      case 'Lingote': return 'formato-badge formato-badge--lingote';
      case 'Moneda': return 'formato-badge formato-badge--moneda';
      case 'Joyería': return 'formato-badge formato-badge--joyeria';
    }
  }

  openCompraDialog(): void {
    this.newCompraFecha.set(this.toDateInputValue(new Date()));
    this.newCompraFormato.set('Lingote');
    this.newCompraPieza.set('');
    this.newCompraGramos.set(null);
    this.newCompraPrecio.set(null);
    this.dialogVisible.set(true);
  }

  closeCompraDialog(): void {
    this.dialogVisible.set(false);
  }

  async submitCompra(): Promise<void> {
    if (!this.canSubmitCompra() || this.saving()) return;
    const user = this.authService.currentUser;
    if (!user) return;

    const fechaValue = this.newCompraFecha();
    const formato = this.newCompraFormato();
    const pieza = this.newCompraPieza().trim();
    const gramos = this.newCompraGramos() as number;
    const precio = this.newCompraPrecio() as number;

    this.saving.set(true);
    try {
      const fechaCompra = fechaValue ? new Date(`${fechaValue}T00:00:00`) : new Date();
      await this.inversionesService.add({
        user_id: user.uid,
        name: pieza,
        gramos,
        pureza: 999.9,
        precio_compra: precio,
        fechaCompra,
        created_at: new Date().toISOString(),
        formato,
        pieza
      });
      this.closeCompraDialog();
    } catch (error) {
      console.error('Error registrando compra de oro:', error);
    } finally {
      this.saving.set(false);
    }
  }

  goToDashboard(): void {
    this.router.navigate(['/desktop']);
  }
}
