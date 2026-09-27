import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore, collection, collectionData, doc,
  addDoc, updateDoc, deleteDoc, query, orderBy
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';

export interface DeudaInformal {
  id: string;
  user_id: string;
  name: string;
  presupuestado: number;
  real: number;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class DeudasInformalesService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  private get uid(): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Usuario no autenticado');
    return uid;
  }

  private col() {
    return collection(this.firestore, 'users', this.uid, 'deudas_informales');
  }

  getAll(): Observable<DeudaInformal[]> {
    try {
      return collectionData(
        query(this.col(), orderBy('created_at', 'asc')),
        { idField: 'id' }
      ) as Observable<DeudaInformal[]>;
    } catch {
      return of([]);
    }
  }

  async add(item: Omit<DeudaInformal, 'id'>): Promise<void> {
    await addDoc(this.col(), item);
  }

  async update(id: string, changes: Partial<Pick<DeudaInformal, 'real' | 'name' | 'presupuestado'>>): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateDoc(doc(this.firestore, 'users', this.uid, 'deudas_informales', id), changes as any);
  }

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'users', this.uid, 'deudas_informales', id));
  }
}
