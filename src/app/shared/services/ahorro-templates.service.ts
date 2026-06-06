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
    const q = query(this.col(), orderBy('order_index'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AhorroTemplate));
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
