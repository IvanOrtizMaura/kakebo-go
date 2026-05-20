import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { inject } from '@angular/core';
import { UserProfileService } from '../../../core/auth/user-profile.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--kakebo-crema)"><p style="color:var(--kakebo-texto-secundario)">Redirigiendo...</p></div>`
})
export class AuthCallbackComponent implements OnInit {
  private auth = inject(Auth);
  private profileService = inject(UserProfileService);
  private router = inject(Router);

  async ngOnInit() {
    // Esperamos a que Firebase resuelva el estado de autenticación
    const user = await new Promise<import('@angular/fire/auth').User | null>(resolve => {
      const unsub = this.auth.onAuthStateChanged(u => { unsub(); resolve(u); });
    });

    if (!user) {
      this.router.navigate(['/auth/login']);
      return;
    }
    const profile = await this.profileService.getProfile(user.uid);
    if (!profile?.onboarding_completed) {
      this.router.navigate(['/onboarding']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}
