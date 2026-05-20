import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Auth, User, authState, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut } from '@angular/fire/auth';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  /**
   * Signal reactivo con el usuario de Firebase Auth.
   * Es null mientras no hay sesión activa.
   */
  readonly user = toSignal<User | null>(authState(this.auth), { initialValue: null });

  /**
   * Alias de compatibilidad: el guard y otros servicios pueden leer `session`
   * igual que antes. En Firebase Auth el "session" equivale al User.
   */
  readonly session = this.user;

  get currentUser(): User | null {
    return this.user();
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    try {
      await signInWithEmailAndPassword(this.auth, email, password);
    } catch (error) {
      throw error;
    }
  }

  async signUpWithEmail(email: string, password: string): Promise<void> {
    try {
      await createUserWithEmailAndPassword(this.auth, email, password);
    } catch (error) {
      throw error;
    }
  }

  async signInWithGoogle(): Promise<void> {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(this.auth, provider);
    } catch (error) {
      throw error;
    }
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
    this.router.navigate(['/auth/login']);
  }
}
