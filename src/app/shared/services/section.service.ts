import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  DocumentData,
  UpdateData
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

type SubCollection = 'gastos' | 'ahorros' | 'pareja' | 'deudas';

@Injectable({ providedIn: 'root' })
export class SectionService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  private colRef(monthId: string, sub: SubCollection) {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Usuario no autenticado');
    return collection(this.firestore, 'users', uid, 'months', monthId, sub);
  }

  private crud(sub: SubCollection) {
    return {
      getAll: (monthId: string): Observable<Record<string, unknown>[]> => {
        const q = query(this.colRef(monthId, sub), orderBy('order_index'));
        return collectionData(q, { idField: 'id' }) as Observable<Record<string, unknown>[]>;
      },
      getByMonth: async (monthId: string): Promise<Record<string, unknown>[]> => {
        const snap = await getDocs(
          query(this.colRef(monthId, sub), orderBy('order_index'))
        );
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>));
      },
      add: async (item: Record<string, unknown>): Promise<Record<string, unknown>> => {
        const monthId = item['month_id'] as string;
        const ref = await addDoc(this.colRef(monthId, sub), { ...item, createdAt: serverTimestamp() });
        return { ...item, id: ref.id };
      },
      update: async (id: string, changes: UpdateData<DocumentData>, monthId: string): Promise<void> => {
        const uid = this.auth.currentUser?.uid;
        if (!uid) throw new Error('Usuario no autenticado');
        const ref = doc(this.firestore, 'users', uid, 'months', monthId, sub, id);
        await updateDoc(ref, changes);
      },
      remove: async (id: string, monthId: string): Promise<void> => {
        const uid = this.auth.currentUser?.uid;
        if (!uid) throw new Error('Usuario no autenticado');
        const ref = doc(this.firestore, 'users', uid, 'months', monthId, sub, id);
        await deleteDoc(ref);
      }
    };
  }

  readonly gastos = this.crud('gastos');
  readonly ahorros = this.crud('ahorros');
  readonly pareja = this.crud('pareja');
  readonly deudas = this.crud('deudas');
}
