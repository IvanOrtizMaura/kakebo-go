import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  addDoc,
  setDoc,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp
} from '@angular/fire/firestore';
import { Month } from '../models';

@Injectable({ providedIn: 'root' })
export class MonthService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  private get uid(): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Usuario no autenticado');
    return uid;
  }

  /** Ruta: users/{uid}/months */
  private monthsCol() {
    return collection(this.firestore, 'users', this.uid, 'months');
  }

  /**
   * Devuelve el mes si existe, o lo crea con toda la inicialización necesaria.
   * Replica la lógica original de Supabase: copia facturas recurrentes,
   * plantillas de ingresos, ahorros y pareja.
   */
  async getOrCreateMonth(userId: string, year: number, month: number): Promise<Month> {
    // Buscar mes existente
    const existing = await this.findMonth(userId, year, month);

    if (existing) {
      const now = new Date();
      const isCurrentOrFuture = year > now.getFullYear() ||
        (year === now.getFullYear() && month >= now.getMonth() + 1);

      if (isCurrentOrFuture) {
        await Promise.all([
          this.syncAhorroTemplates(userId, existing),
          this.syncParejaFromProfile(userId, existing)
        ]);
      }
      return existing;
    }

    // Crear nuevo mes
    const newMonthRef = await addDoc(this.monthsCol(), {
      user_id: userId,
      year,
      month,
      createdAt: serverTimestamp()
    });

    const created: Month = { id: newMonthRef.id, user_id: userId, year, month };

    await Promise.all([
      this.copyRecurringFacturas(userId, created),
      this.copyIngresoTemplates(userId, created),
      this.syncAhorroTemplates(userId, created),
      this.syncParejaFromProfile(userId, created)
    ]);

    return created;
  }

  async getMonthsForYear(userId: string, year: number): Promise<Month[]> {
    return new Promise((resolve, reject) => {
      const q = query(this.monthsCol(), where('year', '==', year), orderBy('month'));
      const sub = collectionData(q, { idField: 'id' }).subscribe({
        next: v => { sub.unsubscribe(); resolve(v as Month[]); },
        error: reject
      });
    });
  }

  // ─── Métodos privados de inicialización ───────────────────────────────────

  private async findMonth(userId: string, year: number, month: number): Promise<Month | null> {
    return new Promise((resolve, reject) => {
      const q = query(
        this.monthsCol(),
        where('year', '==', year),
        where('month', '==', month)
      );
      const sub = collectionData(q, { idField: 'id' }).subscribe({
        next: v => {
          sub.unsubscribe();
          resolve(v.length > 0 ? v[0] as Month : null);
        },
        error: reject
      });
    });
  }

  private async copyRecurringFacturas(userId: string, newMonth: Month): Promise<void> {
    const prevYear = newMonth.month === 1 ? newMonth.year - 1 : newMonth.year;
    const prevMonthNum = newMonth.month === 1 ? 12 : newMonth.month - 1;

    const prevMonth = await this.findMonth(userId, prevYear, prevMonthNum);
    if (!prevMonth) return;

    // Obtener facturas recurrentes del mes anterior
    const facturas = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const q = query(
        collection(this.firestore, 'users', this.uid, 'months', prevMonth.id, 'facturas'),
        where('is_recurring', '==', true)
      );
      const sub = collectionData(q, { idField: 'id' }).subscribe({
        next: v => { sub.unsubscribe(); resolve(v as Record<string, unknown>[]); },
        error: reject
      });
    });

    if (!facturas.length) return;

    const batch = writeBatch(this.firestore);
    facturas.forEach(({ id: _id, month_id: _mid, real: _r, ...f }) => {
      const ref = doc(collection(this.firestore, 'users', this.uid, 'months', newMonth.id, 'facturas'));
      batch.set(ref, { ...f, month_id: newMonth.id, real: 0, is_recurring: false });
    });
    await batch.commit();
  }

  private async copyIngresoTemplates(userId: string, newMonth: Month): Promise<void> {
    const templates = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const q = query(
        collection(this.firestore, 'users', userId, 'ingreso_templates'),
        orderBy('order_index')
      );
      const sub = collectionData(q, { idField: 'id' }).subscribe({
        next: v => { sub.unsubscribe(); resolve(v as Record<string, unknown>[]); },
        error: reject
      });
    });

    if (!templates.length) return;

    const batch = writeBatch(this.firestore);
    templates.forEach((t, idx) => {
      const ref = doc(collection(this.firestore, 'users', this.uid, 'months', newMonth.id, 'ingresos'));
      batch.set(ref, {
        month_id: newMonth.id,
        user_id: userId,
        fuente: t['fuente'],
        esperado: t['esperado'],
        real: 0,
        dia_de_paga: t['dia_de_paga'] ?? null,
        depositado: false,
        order_index: idx
      });
    });
    await batch.commit();
  }

  private async syncAhorroTemplates(userId: string, month: Month): Promise<void> {
    const [templates, existingAhorros] = await Promise.all([
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const q = query(
          collection(this.firestore, 'users', userId, 'ahorro_templates'),
          orderBy('order_index')
        );
        const sub = collectionData(q).subscribe({
          next: v => { sub.unsubscribe(); resolve(v as Record<string, unknown>[]); },
          error: reject
        });
      }),
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const sub = collectionData(
          collection(this.firestore, 'users', this.uid, 'months', month.id, 'ahorros')
        ).subscribe({
          next: v => { sub.unsubscribe(); resolve(v as Record<string, unknown>[]); },
          error: reject
        });
      })
    ]);

    if (!templates.length) return;

    const existingNames = new Set(existingAhorros.map(a => a['name'] as string));
    const toInsert = templates.filter(t => !existingNames.has(t['name'] as string));
    if (!toInsert.length) return;

    const batch = writeBatch(this.firestore);
    toInsert.forEach((t, idx) => {
      const ref = doc(collection(this.firestore, 'users', this.uid, 'months', month.id, 'ahorros'));
      batch.set(ref, {
        month_id: month.id,
        user_id: userId,
        name: t['name'],
        presupuestado: t['presupuestado'],
        real: 0,
        order_index: existingAhorros.length + idx
      });
    });
    await batch.commit();
  }

  private async syncParejaFromProfile(userId: string, month: Month): Promise<void> {
    const profileRef = doc(this.firestore, 'users', userId);
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) return;
    const profile = profileSnap.data();
    if (!profile['has_partner'] || !profile['ingreso_oficial']) return;

    const existingPareja = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const sub = collectionData(
        collection(this.firestore, 'users', this.uid, 'months', month.id, 'pareja')
      ).subscribe({
        next: v => { sub.unsubscribe(); resolve(v as Record<string, unknown>[]); },
        error: reject
      });
    });

    const existingNames = new Set(existingPareja.map(p => p['name'] as string));
    const toInsert: Record<string, unknown>[] = [];

    if (!existingNames.has('Ahorro pareja')) {
      toInsert.push({
        month_id: month.id,
        user_id: userId,
        name: 'Ahorro pareja',
        presupuestado: (profile['ingreso_oficial'] * profile['pareja_ahorro_pct']) / 100,
        real: 0,
        order_index: 0
      });
    }
    if (!existingNames.has('Gastos pareja')) {
      toInsert.push({
        month_id: month.id,
        user_id: userId,
        name: 'Gastos pareja',
        presupuestado: (profile['ingreso_oficial'] * profile['pareja_gastos_pct']) / 100,
        real: 0,
        order_index: 1
      });
    }

    if (!toInsert.length) return;

    const batch = writeBatch(this.firestore);
    toInsert.forEach(item => {
      const ref = doc(collection(this.firestore, 'users', this.uid, 'months', month.id, 'pareja'));
      batch.set(ref, item);
    });
    await batch.commit();
  }
}
