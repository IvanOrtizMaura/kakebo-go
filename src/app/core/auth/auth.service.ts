import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Auth, User, authState, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut } from '@angular/fire/auth';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  // Promise que se resuelve cuando Firebase termina de procesar el redirect de Google.
  // El guard espera esta promise antes de evaluar el estado de auth.
  readonly redirectHandled: Promise<void>;

  readonly user = toSignal<User | null>(authState(this.auth), { initialValue: null });
  readonly session = this.user;

  constructor() {
    this.redirectHandled = getRedirectResult(this.auth).then(result => {
      if (result?.user) {
        this.router.navigate(['/home']);
      }
    }).catch(() => {});
  }

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
    const provider = new GoogleAuthProvider();
    await signInWithRedirect(this.auth, provider);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
    this.router.navigate(['/auth/login']);
  }
}
