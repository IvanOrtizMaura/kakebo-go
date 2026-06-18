import { Component, signal, computed, inject } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Dialog } from 'primeng/dialog';
import { CalendarModule } from 'primeng/calendar';
import { toSignal } from '@angular/core/rxjs-interop';
import { BottomNavComponent } from '../../../layout/bottom-nav/bottom-nav.component';
import { AuthService } from '../../../core/auth/auth.service';
import { InversionesService } from '../../../shared/services/inversiones.service';
import { GoldPriceService } from '../../../shared/services/gold-price.service';
import { Gasto, InversionOro } from '../../../shared/models';
import { MonthService } from '../../../shared/services/month.service';
import { SectionService } from '../../../shared/services/section.service';

interface GastoCreation extends Record<string, unknown> {
  month_id: string;
  user_id: string;
  name: string;
  nombre: string;
  presupuestado: number;
  importe: number;
  real: number;
  tipo: Gasto['tipo'];
  categoria: string;
  order_index: number;
  pagado: boolean;
}

@Component({
  selector: 'app-oro',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, FormsModule, Dialog, CalendarModule, BottomNavComponent],
  templateUrl: './oro.component.html',
  styleUrl: './oro.component.scss'
})
export class OroComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly inversionesService = inject(InversionesService);
  private readonly goldPriceService = inject(GoldPriceService);
  private readonly monthService = inject(MonthService);
  private readonly sectionService = inject(SectionService);

  readonly inversiones = toSignal(this.inversionesService.getAll(), { initialValue: [] as InversionOro[] });
  readonly goldPrice = signal<number | null>(null);
  readonly goldPriceLoading = signal(true);
  readonly lastUpdated = signal<Date | null>(null);
  readonly requestsUsed = signal(0);

  readonly lastUpdatedLabel = computed(() => {
    const date = this.lastUpdated();
    if (!date) return null;
    return date.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  });

  readonly totalInvertido = computed(() =>
    this.inversiones().reduce((sum, inversion) => sum + inversion.precio_compra, 0)
  );

  readonly totalValorActual = computed(() => {
    const price = this.goldPrice();
    if (price === null) return null;
    return this.inversiones().reduce((sum, inversion) => sum + inversion.gramos * price, 0);
  });

  readonly totalGanancia = computed(() => {
    const actual = this.totalValorActual();
    if (actual === null) return null;
    return actual - this.totalInvertido();
  });

  readonly totalPorcentaje = computed(() => {
    const ganancia = this.totalGanancia();
    const invertido = this.totalInvertido();
    if (ganancia === null || invertido === 0) return null;
    return (ganancia / invertido) * 100;
  });

  readonly dialogVisible = signal(false);
  readonly nombreNuevaInversion = signal('');
  readonly gramosNuevaInversion = signal<number | null>(null);
  readonly purezaNuevaInversion = signal<number | null>(null);
  readonly precioCompraNuevaInversion = signal<number | null>(null);
  readonly fechaCompraNuevaInversion = signal<Date>(new Date());
  readonly guardandoInversion = signal(false);

  readonly quilatesOpciones = [
    { label: '24K', value: 999.9 },
    { label: '18K', value: 750 },
    { label: '14K', value: 585 }
  ];

  constructor() {
    const info = this.goldPriceService.getLastUpdated();
    if (info) {
      this.lastUpdated.set(info.date);
      this.requestsUsed.set(info.requestsUsed);
    }

    this.goldPriceService.getGoldPriceEurPerGram().then(price => {
      this.goldPrice.set(price);
      this.goldPriceLoading.set(false);
      const updated = this.goldPriceService.getLastUpdated();
      if (updated) {
        this.lastUpdated.set(updated.date);
        this.requestsUsed.set(updated.requestsUsed);
      }
    });
  }

  valorActual(inversion: InversionOro): number | null {
    const price = this.goldPrice();
    if (price === null) return null;
    return inversion.gramos * price;
  }

  ganancia(inversion: InversionOro): number | null {
    const actual = this.valorActual(inversion);
    if (actual === null) return null;
    return actual - inversion.precio_compra;
  }

  porcentaje(inversion: InversionOro): number | null {
    const gananciaValue = this.ganancia(inversion);
    if (gananciaValue === null || inversion.precio_compra === 0) return null;
    return (gananciaValue / inversion.precio_compra) * 100;
  }

  purezaLabel(pureza: number): string {
    const opcion = this.quilatesOpciones.find(o => o.value === pureza);
    return opcion ? `${opcion.label} (${pureza}‰)` : `${pureza}‰`;
  }

  navigateBack(): void {
    this.router.navigate(['/inversiones']);
  }

  openDialog(): void {
    this.nombreNuevaInversion.set('');
    this.gramosNuevaInversion.set(null);
    this.purezaNuevaInversion.set(null);
    this.precioCompraNuevaInversion.set(null);
    this.fechaCompraNuevaInversion.set(new Date());
    this.dialogVisible.set(true);
  }

  closeDialog(): void {
    this.dialogVisible.set(false);
  }

  async guardarInversion(): Promise<void> {
    const user = this.authService.currentUser;
    const nombre = this.nombreNuevaInversion().trim();
    const gramos = this.gramosNuevaInversion();
    const pureza = this.purezaNuevaInversion();
    const precioCompra = this.precioCompraNuevaInversion();
    const fechaCompra = this.fechaCompraNuevaInversion();

    if (!user || !nombre || gramos === null || gramos <= 0 || pureza === null || pureza <= 0 || precioCompra === null || precioCompra <= 0) {
      return;
    }

    this.guardandoInversion.set(true);
    try {
      const importe = gramos * precioCompra;
      await this.inversionesService.add({
        user_id: user.uid,
        name: nombre,
        gramos,
        pureza,
        precio_compra: precioCompra,
        fechaCompra,
        created_at: new Date().toISOString()
      });
      await this.createPaidExpense(user.uid, fechaCompra, 'Compra Oro', importe);
      this.closeDialog();
    } catch (error) {
      console.error('Error al guardar inversión:', error);
    } finally {
      this.guardandoInversion.set(false);
    }
  }

  updateFechaCompra(fechaCompra: Date | null): void {
    if (!fechaCompra) {
      return;
    }

    this.fechaCompraNuevaInversion.set(fechaCompra);
  }

  private async createPaidExpense(userId: string, expenseDate: Date, name: string, amount: number): Promise<void> {
    const month = await this.monthService.getOrCreateMonth(
      userId,
      expenseDate.getFullYear(),
      expenseDate.getMonth() + 1
    );
    const existingExpenses = await this.sectionService.gastos.getByMonth(month.id);
    const gasto: GastoCreation = {
      month_id: month.id,
      user_id: userId,
      name,
      nombre: name,
      presupuestado: amount,
      importe: amount,
      real: amount,
      tipo: 'variables',
      categoria: 'Inversiones',
      order_index: existingExpenses.length,
      pagado: true
    };

    await this.sectionService.gastos.add(gasto);
  }

  async eliminarInversion(inversion: InversionOro): Promise<void> {
    const confirmado = window.confirm(`¿Eliminar "${inversion.name}"?`);
    if (!confirmado) return;
    try {
      await this.inversionesService.remove(inversion.id);
    } catch (error) {
      console.error('Error al eliminar inversión:', error);
    }
  }
}
