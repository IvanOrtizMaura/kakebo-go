import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, User } from '@angular/fire/auth';
import { UserProfileService } from './user-profile.service';

export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const profileService = inject(UserProfileService);
  const router = inject(Router);

  const user = await new Promise<User | null>(resolve => {
    const unsubscribe = auth.onAuthStateChanged(u => {
      unsubscribe();
      resolve(u);
    });
  });

  if (!user) {
    router.navigate(['/auth/login']);
    return false;
  }

  const profile = await profileService.getProfile(user.uid);
  if (!profile?.onboarding_completed) {
    router.navigate(['/onboarding']);
    return false;
  }
  return true;
};
