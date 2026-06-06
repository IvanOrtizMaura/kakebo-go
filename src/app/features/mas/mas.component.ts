import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BottomNavComponent } from '../../layout/bottom-nav/bottom-nav.component';

interface MenuSection {
  title: string;
  items: MenuItem[];
}

interface MenuItem {
  label: string;
  summary: string;
  icon: string;
  color: string;
  route: string | null;
  disabled?: boolean;
}

@Component({
  selector: 'app-mas',
  standalone: true,
  imports: [RouterLink, BottomNavComponent],
  templateUrl: './mas.component.html',
  styleUrl: './mas.component.scss'
})
export class MasComponent {
  readonly monthSection: MenuSection = {
    title: 'Este mes',
    items: [
      {
        label: 'Ingresos',
        summary: '2 fuentes · 2.450 € ingresados',
        icon: 'pi-arrow-up-right',
        color: '#8b5cf6',
        route: '/ingresos'
      },
      {
        label: 'Gastos',
        summary: '4 gastos · 650 € / 600 €',
        icon: 'pi-shopping-cart',
        color: '#ef4444',
        route: '/gastos'
      },
      {
        label: 'Facturas',
        summary: '3 facturas · 780 € / 800 €',
        icon: 'pi-file',
        color: '#3b82f6',
        route: '/facturas'
      },
      {
        label: 'Ahorros',
        summary: '2 fondos · 200 € / 300 €',
        icon: 'pi-wallet',
        color: '#22c55e',
        route: '/ahorros'
      },
      {
        label: 'Deudas',
        summary: '1 deuda · 260 € / 400 €',
        icon: 'pi-credit-card',
        color: '#f59e0b',
        route: '/deudas'
      }
    ]
  };

  readonly generalSection: MenuSection = {
    title: 'General',
    items: [
      {
        label: 'Resumen anual',
        summary: 'Ver todos los meses',
        icon: 'pi-chart-bar',
        color: '#3b82f6',
        route: '/resumen-anual',
        disabled: false
      },
      {
        label: 'Inversiones',
        summary: 'Seguimiento de tu cartera',
        icon: 'pi-chart-line',
        color: '#f59e0b',
        route: '/inversiones',
        disabled: false
      },
      {
        label: 'Análisis IA',
        summary: 'Consejos personalizados con IA',
        icon: 'pi-sparkles',
        color: '#8b5cf6',
        route: null,
        disabled: true
      },
      {
        label: 'Ajustes',
        summary: 'Perfil, notificaciones',
        icon: 'pi-cog',
        color: '#64748b',
        route: '/settings',
        disabled: true
      }
    ]
  };
}
