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
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch
} from '@angular/fire/firestore';
import { Deuda, DeudaMonthly } from '../models';

@Injectable({ providedIn: 'root' })
export class DeudasService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  private get uid(): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Usuario no autenticado');
    return uid;
  }

  /** Ruta: users/{uid}/deudas */
  private deudasCol() {
    return collection(this.firestore, 'users', this.uid, 'deudas');
  }

  /** Ruta: users/{uid}/deudas_monthly */
  private monthlyCol() {
    return collection(this.firestore, 'users', this.uid, 'deudas_monthly');
  }

  async getActive(userId: string): Promise<Deuda[]> {
    return new Promise((resolve, reject) => {
      const q = query(this.deudasCol(), where('is_active', '==', true), orderBy('total_amount'));
      const sub = collectionData(q, { idField: 'id' }).subscribe({
        next: v => { sub.unsubscribe(); resolve(v as Deuda[]); },
        error: reject
      });
    });
  }

  async getArchived(userId: string): Promise<Deuda[]> {
    return new Promise((resolve, reject) => {
      const q = query(this.deudasCol(), where('is_active', '==', false), orderBy('total_amount'));
      const sub = collectionData(q, { idField: 'id' }).subscribe({
        next: v => { sub.unsubscribe(); resolve(v as Deuda[]); },
        error: reject
      });
    });
  }

  async create(deuda: Omit<Deuda, 'id'>): Promise<Deuda> {
    const ref = await addDoc(this.deudasCol(), { ...deuda, createdAt: serverTimestamp() });
    return { ...deuda, id: ref.id };
  }

  async update(id: string, patch: Partial<Pick<Deuda, 'name' | 'num_months' | 'monthly_payment' | 'start_year' | 'start_month'>>): Promise<void> {
    const ref = doc(this.firestore, 'users', this.uid, 'deudas', id);
    await updateDoc(ref, patch as any);
  }

  async archive(id: string): Promise<void> {
    const ref = doc(this.firestore, 'users', this.uid, 'deudas', id);
    await updateDoc(ref, { is_active: false });
  }

  async unarchive(id: string): Promise<void> {
    const ref = doc(this.firestore, 'users', this.uid, 'deudas', id);
    await updateDoc(ref, { is_active: true });
  }

  async delete(id: string): Promise<void> {
    const batch = writeBatch(this.firestore);

    // Eliminar registros mensuales asociados
    const monthlyQuery = query(this.monthlyCol(), where('deuda_id', '==', id));
    const monthlySnap = await new Promise<DeudaMonthly[]>((resolve, reject) => {
      const sub = collectionData(monthlyQuery, { idField: 'id' }).subscribe({
        next: v => { sub.unsubscribe(); resolve(v as DeudaMonthly[]); },
        error: reject
      });
    });

    monthlySnap.forEach(m => {
      batch.delete(doc(this.firestore, 'users', this.uid, 'deudas_monthly', m.id));
    });
    batch.delete(doc(this.firestore, 'users', this.uid, 'deudas', id));
    await batch.commit();
  }

  async getMonthlyByMonth(monthId: string): Promise<DeudaMonthly[]> {
    return new Promise((resolve, reject) => {
      const q = query(this.monthlyCol(), where('month_id', '==', monthId));
      const sub = collectionData(q, { idField: 'id' }).subscribe({
        next: v => { sub.unsubscribe(); resolve(v as DeudaMonthly[]); },
        error: reject
      });
    });
  }

  async upsertMonthly(item: Omit<DeudaMonthly, 'id'>): Promise<void> {
    // Usamos un ID compuesto determinista para hacer upsert (deuda_id + month_id)
    const id = `${item.deuda_id}_${item.month_id}`;
    const ref = doc(this.firestore, 'users', this.uid, 'deudas_monthly', id);
    await setDoc(ref, item, { merge: true });
  }

  async applyPayment(deudaId: string, monthId: string, amount: number): Promise<void> {
    const deudaRef = doc(this.firestore, 'users', this.uid, 'deudas', deudaId);
    const snap = await getDoc(deudaRef);
    if (!snap.exists()) throw new Error('Deuda no encontrada');

    const deuda = snap.data() as Deuda;
    const newRemaining = Math.max(0, deuda.amount_remaining - amount);
    const isActive = newRemaining > 0;

    const monthlyId = `${deudaId}_${monthId}`;
    const monthlyRef = doc(this.firestore, 'users', this.uid, 'deudas_monthly', monthlyId);

    const batch = writeBatch(this.firestore);
    batch.update(deudaRef, { amount_remaining: newRemaining, is_active: isActive });
    batch.set(monthlyRef, { deuda_id: deudaId, month_id: monthId, real: amount }, { merge: true });
    await batch.commit();
  }
}
