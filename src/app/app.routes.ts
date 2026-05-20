import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { onboardingGuard } from './core/auth/onboarding.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: 'auth/login', loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) },
  { path: 'auth/register', loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent) },
  { path: 'auth/callback', loadComponent: () => import('./features/auth/callback/auth-callback.component').then(m => m.AuthCallbackComponent) },
  { path: 'onboarding', loadComponent: () => import('./features/onboarding/onboarding.component').then(m => m.OnboardingComponent), canActivate: [authGuard] },
  {
    path: '',
    loadComponent: () => import('./layout/app-layout/app-layout.component').then(m => m.AppLayoutComponent),
    canActivate: [authGuard, onboardingGuard],
    children: [
      { path: 'm/:year/:month', loadComponent: () => import('./features/month/month-view/month-view.component').then(m => m.MonthViewComponent) },
      { path: 'settings', loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent) },
    ]
  },
  {
    path: 'home',
    loadComponent: () => import('./features/month/home/home.component').then(m => m.HomeComponent),
    canActivate: [authGuard, onboardingGuard]
  },
  {
    path: 'ingresos',
    loadComponent: () => import('./features/month/ingresos/ingresos.component').then(m => m.IngresosComponent),
    canActivate: [authGuard, onboardingGuard]
  },
  {
    path: 'gastos',
    loadComponent: () => import('./features/month/gastos/gastos.component').then(m => m.GastosComponent),
    canActivate: [authGuard, onboardingGuard]
  },
  {
    path: 'mas',
    loadComponent: () => import('./features/mas/mas.component').then(m => m.MasComponent),
    canActivate: [authGuard, onboardingGuard]
  },
  {
    path: 'facturas',
    loadComponent: () => import('./features/month/facturas/facturas.component').then(m => m.FacturasComponent),
    canActivate: [authGuard, onboardingGuard]
  },
  {
    path: 'ahorros',
    loadComponent: () => import('./features/month/ahorros/ahorros.component').then(m => m.AhorrosComponent),
    canActivate: [authGuard, onboardingGuard]
  },
  {
    path: 'deudas',
    loadComponent: () => import('./features/month/deudas/deudas.component').then(m => m.DeudasComponent),
    canActivate: [authGuard, onboardingGuard]
  },
  {
    path: 'planificacion',
    loadComponent: () => import('./features/planificacion/planificacion.component').then(m => m.PlanificacionComponent),
    canActivate: [authGuard, onboardingGuard]
  },
  {
    path: 'resumen-anual',
    loadComponent: () => import('./features/resumen-anual/resumen-anual.component').then(m => m.ResumenAnualComponent),
    canActivate: [authGuard, onboardingGuard]
  },
  { path: '**', redirectTo: '/home' }
];
