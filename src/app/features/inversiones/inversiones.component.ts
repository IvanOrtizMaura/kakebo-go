import { Component, signal, computed, inject } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Dialog } from 'primeng/dialog';
import { toSignal } from '@angular/core/rxjs-interop';
import { BottomNavComponent } from '../../layout/bottom-nav/bottom-nav.component';
import { AuthService } from '../../core/auth/auth.service';
import { InversionesService } from '../../shared/services/inversiones.service';
import { GoldPriceService } from '../../shared/services/gold-price.service';
import { InversionOro } from '../../shared/models';

@Component({
  selector: 'app-inversiones',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, FormsModule, Dialog, BottomNavComponent],
  templateUrl: './inversiones.component.html',
  styleUrl: './inversiones.component.scss'
})
export class InversionesComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly inversionesService = inject(InversionesService);
  private readonly goldPriceService = inject(GoldPriceService);

  readonly inversiones = toSignal(this.inversionesService.getAll(), { initialValue: [] as InversionOro[] });
  readonly goldPrice = signal<number | null>(null);
  readonly goldPriceLoading = signal(true);
  readonly lastUpdated = signal<Date | null>(null);
  readonly requestsUsed = signal(0);

  readonly lastUpdatedLabel = computed(() => {
    const d = this.lastUpdated();
    if (!d) return null;
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  });

  readonly totalInvertido = computed(() =>
    this.inversiones().reduce((sum, i) => sum + i.precio_compra, 0)
  );

  readonly totalValorActual = computed(() => {
    const price = this.goldPrice();
    if (price === null) return null;
    return this.inversiones().reduce((sum, i) => sum + i.gramos * price, 0);
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
  readonly guardandoInversion = signal(false);

  readonly quilatesOpciones = [
    { label: '24K', value: 999.9 },
    { label: '18K', value: 750 },
    { label: '14K', value: 585 }
  ];

  constructor() {
    // Load last updated info immediately from cache (no async needed)
    const info = this.goldPriceService.getLastUpdated();
    if (info) {
      this.lastUpdated.set(info.date);
      this.requestsUsed.set(info.requestsUsed);
    }

    this.goldPriceService.getGoldPriceEurPerGram().then(price => {
      this.goldPrice.set(price);
      this.goldPriceLoading.set(false);
      // Refresh after fetch in case it updated
      const updated = this.goldPriceService.getLastUpdated();
      if (updated) {
        this.lastUpdated.set(updated.date);
        this.requestsUsed.set(updated.requestsUsed);
      }
    });
  }

  valorActual(inv: InversionOro): number | null {
    const price = this.goldPrice();
    if (price === null) return null;
    return inv.gramos * price;
  }

  ganancia(inv: InversionOro): number | null {
    const actual = this.valorActual(inv);
    if (actual === null) return null;
    return actual - inv.precio_compra;
  }

  porcentaje(inv: InversionOro): number | null {
    const g = this.ganancia(inv);
    if (g === null || inv.precio_compra === 0) return null;
    return (g / inv.precio_compra) * 100;
  }

  purezaLabel(pureza: number): string {
    const opcion = this.quilatesOpciones.find(o => o.value === pureza);
    return opcion ? `${opcion.label} (${pureza}‰)` : `${pureza}‰`;
  }

  navigateBack(): void {
    this.router.navigate(['/mas']);
  }

  openDialog(): void {
    this.nombreNuevaInversion.set('');
    this.gramosNuevaInversion.set(null);
    this.purezaNuevaInversion.set(null);
    this.precioCompraNuevaInversion.set(null);
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

    if (!user || !nombre || gramos === null || gramos <= 0 || pureza === null || pureza <= 0 || precioCompra === null || precioCompra <= 0) {
      return;
    }

    this.guardandoInversion.set(true);
    try {
      await this.inversionesService.add({
        user_id: user.uid,
        name: nombre,
        gramos,
        pureza,
        precio_compra: precioCompra,
        created_at: new Date().toISOString()
      });
      this.closeDialog();
    } catch (error) {
      console.error('Error al guardar inversión:', error);
    } finally {
      this.guardandoInversion.set(false);
    }
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
