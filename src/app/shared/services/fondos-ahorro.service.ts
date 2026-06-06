import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  setDoc,
  getCountFromServer
} from '@angular/fire/firestore';
import { FondoAhorro, FondoAhorroMonthly } from '../models';

@Injectable({ providedIn: 'root' })
export class FondosAhorroService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  private get uid(): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Usuario no autenticado');
    return uid;
  }

  private fondosCol() {
    return collection(this.firestore, 'users', this.uid, 'fondos_ahorro');
  }

  private monthlyCol() {
    return collection(this.firestore, 'users', this.uid, 'fondos_ahorro_monthly');
  }

  async getActive(userId: string): Promise<FondoAhorro[]> {
    const q = query(this.fondosCol(), where('is_active', '==', true), orderBy('createdAt'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as FondoAhorro));
  }

  async getArchived(userId: string): Promise<FondoAhorro[]> {
    const q = query(this.fondosCol(), where('is_active', '==', false), orderBy('createdAt'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as FondoAhorro));
  }

  async create(fondo: Omit<FondoAhorro, 'id'>): Promise<FondoAhorro> {
    const ref = await addDoc(this.fondosCol(), { ...fondo, createdAt: serverTimestamp() });
    return { ...fondo, id: ref.id };
  }

  async update(id: string, patch: Partial<Pick<FondoAhorro, 'name' | 'total_amount' | 'monthly_amount' | 'num_months'>>): Promise<void> {
    const ref = doc(this.firestore, 'users', this.uid, 'fondos_ahorro', id);
    await updateDoc(ref, patch as any);
  }

  async archive(id: string): Promise<void> {
    const ref = doc(this.firestore, 'users', this.uid, 'fondos_ahorro', id);
    await updateDoc(ref, { is_active: false });
  }

  async deactivate(id: string): Promise<void> {
    return this.archive(id);
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, 'users', this.uid, 'fondos_ahorro', id);
    await deleteDoc(ref);
  }

  async getMonthlyByMonth(monthId: string): Promise<FondoAhorroMonthly[]> {
    const q = query(this.monthlyCol(), where('month_id', '==', monthId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as FondoAhorroMonthly));
  }

  async upsertMonthly(item: Omit<FondoAhorroMonthly, 'id'>): Promise<void> {
    const id = `${item.fondo_id}_${item.month_id}`;
    const ref = doc(this.firestore, 'users', this.uid, 'fondos_ahorro_monthly', id);
    await setDoc(ref, item, { merge: true });
  }

  async updateMonthlyReal(fondoId: string, monthId: string, real: number): Promise<void> {
    const id = `${fondoId}_${monthId}`;
    const ref = doc(this.firestore, 'users', this.uid, 'fondos_ahorro_monthly', id);
    await updateDoc(ref, { real });
  }

  async countCompletedMonths(fondoId: string): Promise<number> {
    const q = query(this.monthlyCol(), where('fondo_id', '==', fondoId));
    const snap = await getCountFromServer(q);
    return snap.data().count;
  }
}
