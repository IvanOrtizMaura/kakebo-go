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

export interface IngresoTemplate {
  id: string;
  user_id: string;
  fuente: string;
  esperado: number;
  dia_de_paga: string | null;
  order_index: number;
}

@Injectable({ providedIn: 'root' })
export class IngresoTemplatesService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  private get uid(): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Usuario no autenticado');
    return uid;
  }

  private col() {
    return collection(this.firestore, 'users', this.uid, 'ingreso_templates');
  }

  async getAll(userId: string): Promise<IngresoTemplate[]> {
    return new Promise((resolve, reject) => {
      const q = query(this.col(), orderBy('order_index'));
      const sub = collectionData(q, { idField: 'id' }).subscribe({
        next: v => { sub.unsubscribe(); resolve(v as IngresoTemplate[]); },
        error: reject
      });
    });
  }

  async add(item: Omit<IngresoTemplate, 'id'>): Promise<IngresoTemplate> {
    const ref = await addDoc(this.col(), { ...item, createdAt: serverTimestamp() });
    return { ...item, id: ref.id };
  }

  async update(id: string, changes: Partial<Pick<IngresoTemplate, 'fuente' | 'esperado'>>): Promise<void> {
    const ref = doc(this.firestore, 'users', this.uid, 'ingreso_templates', id);
    await updateDoc(ref, changes as any);
  }

  async remove(id: string): Promise<void> {
    const ref = doc(this.firestore, 'users', this.uid, 'ingreso_templates', id);
    await deleteDoc(ref);
  }
}
