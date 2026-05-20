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
import { AhorroTemplate } from '../models';

@Injectable({ providedIn: 'root' })
export class AhorroTemplatesService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  private get uid(): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Usuario no autenticado');
    return uid;
  }

  private col() {
    return collection(this.firestore, 'users', this.uid, 'ahorro_templates');
  }

  async getAll(userId: string): Promise<AhorroTemplate[]> {
    return new Promise((resolve, reject) => {
      const q = query(this.col(), orderBy('order_index'));
      const sub = collectionData(q, { idField: 'id' }).subscribe({
        next: v => { sub.unsubscribe(); resolve(v as AhorroTemplate[]); },
        error: reject
      });
    });
  }

  async add(template: Omit<AhorroTemplate, 'id' | 'created_at'>): Promise<void> {
    await addDoc(this.col(), { ...template, created_at: serverTimestamp() });
  }

  async update(id: string, patch: Partial<Pick<AhorroTemplate, 'name' | 'presupuestado'>>): Promise<void> {
    const ref = doc(this.firestore, 'users', this.uid, 'ahorro_templates', id);
    await updateDoc(ref, patch as any);
  }

  async remove(id: string): Promise<void> {
    const ref = doc(this.firestore, 'users', this.uid, 'ahorro_templates', id);
    await deleteDoc(ref);
  }
}
