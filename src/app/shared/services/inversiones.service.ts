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
  orderBy
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { InversionOro } from '../models';

@Injectable({ providedIn: 'root' })
export class InversionesService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  private get uid(): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Usuario no autenticado');
    return uid;
  }

  private inversionesCol() {
    return collection(this.firestore, 'users', this.uid, 'inversiones');
  }

  getAll(): Observable<InversionOro[]> {
    try {
      const orderedQuery = query(this.inversionesCol(), orderBy('created_at', 'asc'));
      return collectionData(orderedQuery, { idField: 'id' }) as Observable<InversionOro[]>;
    } catch {
      return of([]);
    }
  }

  async add(item: Omit<InversionOro, 'id'>): Promise<void> {
    await addDoc(this.inversionesCol(), item);
  }

  async update(id: string, changes: Partial<Omit<InversionOro, 'id'>>): Promise<void> {
    const inversionRef = doc(this.firestore, 'users', this.uid, 'inversiones', id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateDoc(inversionRef, changes as any);
  }

  async remove(id: string): Promise<void> {
    const inversionRef = doc(this.firestore, 'users', this.uid, 'inversiones', id);
    await deleteDoc(inversionRef);
  }
}
