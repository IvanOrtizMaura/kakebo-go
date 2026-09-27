import { Injectable, inject, signal } from '@angular/core';
import { UserProfileService } from '../../core/auth/user-profile.service';
import {
  DashboardBlockKey,
  DashboardCategoryKey,
  DashboardLayout,
  DashboardLayoutEntry
} from '../models';

export interface DashboardBlockMeta {
  key: DashboardBlockKey;
  label: string;
  description: string;
  /** Los bloques compactos comparten fila cuando quedan contiguos. */
  compact: boolean;
}

export interface DashboardCategoryMeta {
  key: DashboardCategoryKey;
  label: string;
  color: string;
}

/** Catálogo de bloques: orden de este array = layout por defecto. */
export const DASHBOARD_BLOCKS: DashboardBlockMeta[] = [
  { key: 'kpis', label: 'Indicadores', description: 'Ingresos, gastos, queda por gastar y días para cobrar', compact: false },
  { key: 'distribucion', label: 'Distribución del presupuesto', description: 'Gráfico de donut por categoría', compact: true },
  { key: 'resumen', label: 'Resumen del presupuesto', description: 'Tabla presupuestado vs. real', compact: true },
  { key: 'objetivo', label: 'Objetivo de ahorro', description: 'Anillo de progreso sobre el 20% de ingresos', compact: true },
  { key: 'ingresos', label: 'Ingresos', description: 'Tabla de fuentes de ingreso del mes', compact: false },
  { key: 'categorias', label: 'Categorías', description: 'Rejilla con las tablas de cada categoría', compact: false },
  { key: 'deudas', label: 'Deudas', description: 'Gastos no presupuestados pendientes de pagar', compact: false },
  { key: 'oro', label: 'Compras de oro', description: 'Inversiones en oro registradas este mes', compact: false }
];

export const DASHBOARD_CATEGORIES: DashboardCategoryMeta[] = [
  { key: 'facturas', label: 'Facturas', color: 'rgb(248,159,52)' },
  { key: 'gastos', label: 'Gastos', color: 'rgb(88,168,186)' },
  { key: 'ahorros', label: 'Ahorros', color: 'rgb(96,168,68)' },
  { key: 'pareja', label: 'Pareja', color: 'rgb(152,113,187)' },
  { key: 'fondos', label: 'Fondos de ahorro', color: 'rgb(26,122,178)' }
];

const BLOCK_KEYS = DASHBOARD_BLOCKS.map(block => block.key);
const CATEGORY_KEYS = DASHBOARD_CATEGORIES.map(category => category.key);

export function defaultDashboardLayout(): DashboardLayout {
  return {
    blocks: BLOCK_KEYS.map(key => ({ key, visible: true })),
    categories: CATEGORY_KEYS.map(key => ({ key, visible: true }))
  };
}

/**
 * Reconcilia lo guardado con el catálogo actual: descarta claves que ya no
 * existen y añade al final las que se hayan incorporado desde el último
 * guardado, de modo que una versión nueva de la app nunca deje huecos.
 */
function reconcile<K extends string>(
  stored: DashboardLayoutEntry<K>[] | undefined,
  catalogue: readonly K[]
): DashboardLayoutEntry<K>[] {
  const known = new Set(catalogue);
  const seen = new Set<K>();
  const result: DashboardLayoutEntry<K>[] = [];

  for (const entry of stored ?? []) {
    if (!entry || !known.has(entry.key) || seen.has(entry.key)) continue;
    seen.add(entry.key);
    result.push({ key: entry.key, visible: entry.visible !== false });
  }
  for (const key of catalogue) {
    if (!seen.has(key)) result.push({ key, visible: true });
  }
  return result;
}

export function normalizeDashboardLayout(stored: Partial<DashboardLayout> | undefined | null): DashboardLayout {
  return {
    blocks: reconcile(stored?.blocks, BLOCK_KEYS),
    categories: reconcile(stored?.categories, CATEGORY_KEYS)
  };
}

@Injectable({ providedIn: 'root' })
export class DashboardLayoutService {
  private readonly userProfileService = inject(UserProfileService);

  /** Cache en memoria para que el dashboard no espere a Firestore al volver. */
  readonly layout = signal<DashboardLayout>(defaultDashboardLayout());

  private loadedFor: string | null = null;

  async load(userId: string, force = false): Promise<DashboardLayout> {
    if (!force && this.loadedFor === userId) return this.layout();
    const profile = await this.userProfileService.getProfile(userId);
    const layout = normalizeDashboardLayout(profile?.dashboard_layout);
    this.loadedFor = userId;
    this.layout.set(layout);
    return layout;
  }

  async save(userId: string, layout: DashboardLayout): Promise<void> {
    const normalized = normalizeDashboardLayout(layout);
    await this.userProfileService.upsertProfile({ id: userId, dashboard_layout: normalized });
    this.loadedFor = userId;
    this.layout.set(normalized);
  }

  async reset(userId: string): Promise<DashboardLayout> {
    const layout = defaultDashboardLayout();
    await this.save(userId, layout);
    return layout;
  }
}
