import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../supabase/supabase.service';
import { UserProfileService } from './user-profile.service';

export const onboardingGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const profileService = inject(UserProfileService);
  const router = inject(Router);

  const { data } = await supabase.client.auth.getSession();
  if (!data.session) {
    router.navigate(['/auth/login']);
    return false;
  }

  const profile = await profileService.getProfile(data.session.user.id);
  if (!profile?.onboarding_completed) {
    router.navigate(['/onboarding']);
    return false;
  }
  return true;
};
