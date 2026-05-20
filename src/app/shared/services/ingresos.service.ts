import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Ingreso } from '../models';

@Injectable({ providedIn: 'root' })
export class IngresosService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  /** Ruta: users/{uid}/months/{monthId}/ingresos */
  private colRef(monthId: string) {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Usuario no autenticado');
    return collection(this.firestore, 'users', uid, 'months', monthId, 'ingresos');
  }

  getAll(monthId: string): Observable<Ingreso[]> {
    const q = query(this.colRef(monthId), orderBy('order_index'));
    return collectionData(q, { idField: 'id' }) as Observable<Ingreso[]>;
  }

  /** @deprecated Usa getAll() para flujo reactivo. Mantener para compatibilidad. */
  async getByMonth(monthId: string): Promise<Ingreso[]> {
    return new Promise((resolve, reject) => {
      const sub = this.getAll(monthId).subscribe({ next: v => { sub.unsubscribe(); resolve(v); }, error: reject });
    });
  }

  async add(item: Omit<Ingreso, 'id'>): Promise<Ingreso> {
    const ref = await addDoc(this.colRef(item.month_id), { ...item, createdAt: serverTimestamp() });
    return { ...item, id: ref.id };
  }

  async update(id: string, monthId: string, changes: Partial<Ingreso>): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Usuario no autenticado');
    const ref = doc(this.firestore, 'users', uid, 'months', monthId, 'ingresos', id);
    await updateDoc(ref, changes as any);
  }

  async remove(id: string, monthId: string): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Usuario no autenticado');
    const ref = doc(this.firestore, 'users', uid, 'months', monthId, 'ingresos', id);
    await deleteDoc(ref);
  }
}
