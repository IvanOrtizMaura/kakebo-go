import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);

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
