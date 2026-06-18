import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query
} from '@angular/fire/firestore';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface AportacionPension {
  id: string;
  fecha: Date;
  importe: number;
  nota?: string;
}

@Injectable({ providedIn: 'root' })
export class PensionesService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  private get uid(): string | null {
    return this.auth.currentUser?.uid ?? null;
  }

  getAll(): Observable<AportacionPension[]> {
    const uid = this.uid;
    if (!uid) {
      return of([]);
    }

    const aportacionesQuery = query(
      collection(this.firestore, 'users', uid, 'pensiones_aportaciones'),
      orderBy('fecha', 'desc')
    );

    return from(getDocs(aportacionesQuery)).pipe(
      map(snapshot =>
        snapshot.docs.map(docSnapshot => {
          const data = docSnapshot.data() as {
            fecha?: Date | Timestamp | string;
            importe?: number;
            nota?: string;
          };

          return {
            id: docSnapshot.id,
            fecha: this.toDate(data.fecha),
            importe: typeof data.importe === 'number' ? data.importe : 0,
            nota: data.nota?.trim() ? data.nota.trim() : undefined
          };
        })
      ),
      catchError(() => of([]))
    );
  }

  async add(aportacion: Omit<AportacionPension, 'id'>): Promise<void> {
    const uid = this.uid;
    if (!uid) {
      return;
    }

    await addDoc(collection(this.firestore, 'users', uid, 'pensiones_aportaciones'), aportacion);
  }

  async delete(id: string): Promise<void> {
    const uid = this.uid;
    if (!uid) {
      return;
    }

    await deleteDoc(doc(this.firestore, 'users', uid, 'pensiones_aportaciones', id));
  }

  private toDate(value: Date | Timestamp | string | undefined): Date {
    if (value instanceof Date) {
      return value;
    }

    if (value instanceof Timestamp) {
      return value.toDate();
    }

    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return new Date();
  }
}
