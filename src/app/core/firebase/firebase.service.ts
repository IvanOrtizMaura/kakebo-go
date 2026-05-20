import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

/**
 * FirebaseService — punto central de acceso a Firestore y Auth.
 * Reemplaza a SupabaseService. Inyecta directamente los tokens de @angular/fire
 * para que cualquier servicio que lo necesite pueda extender o componer este.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  readonly firestore: Firestore = inject(Firestore);
  readonly auth: Auth = inject(Auth);
}
