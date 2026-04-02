import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { UserProfileService } from '../../../core/auth/user-profile.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--kakebo-crema)"><p style="color:var(--kakebo-texto-secundario)">Redirigiendo...</p></div>`
})
export class AuthCallbackComponent implements OnInit {
  constructor(
    private supabase: SupabaseService,
    private profileService: UserProfileService,
    private router: Router
  ) {}

  async ngOnInit() {
    const { data } = await this.supabase.client.auth.getSession();
    if (!data.session) {
      this.router.navigate(['/auth/login']);
      return;
    }
    const profile = await this.profileService.getProfile(data.session.user.id);
    if (!profile?.onboarding_completed) {
      this.router.navigate(['/onboarding']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}
