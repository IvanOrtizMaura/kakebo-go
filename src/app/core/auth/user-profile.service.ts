import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { UserProfile } from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  /**
   * Obtiene el perfil del usuario desde Firestore.
   * Colección: users/{uid}
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      const ref = doc(this.firestore, 'users', userId);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) return null;
      return { id: snapshot.id, ...snapshot.data() } as UserProfile;
    } catch {
      return null;
    }
  }

  /**
   * Crea o actualiza el perfil del usuario en Firestore.
   * Usa merge: true para no sobreescribir campos existentes.
   */
  async upsertProfile(profile: Partial<UserProfile> & { id: string }): Promise<void> {
    const { id, ...data } = profile;
    const ref = doc(this.firestore, 'users', id);
    await setDoc(ref, data, { merge: true });
  }
}
