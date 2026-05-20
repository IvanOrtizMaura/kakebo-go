import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const authService = inject(AuthService);
  const router = inject(Router);

  // Espera a que Firebase procese el redirect de Google antes de evaluar auth
  await authService.redirectHandled;

  const user = await new Promise(resolve => {
    const unsubscribe = auth.onAuthStateChanged(u => {
      unsubscribe();
      resolve(u);
    });
  });

  if (!user) {
    router.navigate(['/auth/login']);
    return false;
  }
  return true;
};
