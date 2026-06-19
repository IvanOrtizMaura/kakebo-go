# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm start            # Dev server at http://localhost:4200
pnpm build            # Production build to dist/kakebo-go
pnpm test             # Run all Karma/Jasmine tests
pnpm run deploy       # Build + deploy to Firebase Hosting
ng test --include=**/feature.spec.ts   # Run a single test file
ng generate component features/my-feature --standalone  # Scaffold component
```

## API Keys & Secrets

`src/environments/environment.prod.ts` is tracked in git with **blank values**. It is marked with `git update-index --skip-worktree` so local changes are never committed accidentally.

**To set up locally:**
1. Edit `src/environments/environment.prod.ts` and fill in `openaiApiKey`
2. Git will not track this change — you only do this once
3. `pnpm run deploy` will pick up the key automatically

**To check which files have skip-worktree:**
```bash
git ls-files -v | grep '^S'
```

**If you ever need to update the committed version of environment.prod.ts:**
```bash
git update-index --no-skip-worktree src/environments/environment.prod.ts
# make your changes, commit, then re-enable:
git update-index --skip-worktree src/environments/environment.prod.ts
```

**Deploy:** Firebase Hosting only — `pnpm run deploy`. Never use Vercel.

## What This App Does

Kakebo-go is a personal finance web app (UI in Spanish) following the Japanese Kakebo budgeting method. Users track monthly income, bills, expenses, savings, partner expenses, savings goals, and debts. The app navigates by month and provides an annual summary and investment tracking (gold + pensions).

## Architecture

### Stack

| Layer | Tech |
|---|---|
| Framework | Angular 19, standalone components, no NgModules |
| State | Angular Signals + RxJS (no NgRx) |
| Backend | Firebase Firestore + Firebase Auth |
| UI | PrimeNG 19, PrimeIcons, SCSS |
| Package manager | pnpm |
| Tests | Karma + Jasmine |
| Deploy | Firebase Hosting only — `pnpm run deploy` |

> Supabase is deprecated — `supabase.service.ts` is dead code.

### Layer Structure

```
src/app/
  core/
    auth/          ← AuthService, UserProfileService, authGuard, onboardingGuard
    firebase/      ← Firebase app initialization
  features/        ← Route-level pages (lazy-loaded)
  layout/          ← AppLayoutComponent, Sidebar, BottomNav (mobile)
  shared/
    models/        ← All TypeScript interfaces (barrel-exported from index.ts)
    services/      ← One Firestore CRUD service per collection
    components/
      budget-table/ ← Central reusable table component
```

### Firestore Data Model

All user data lives under `users/{uid}/`:

```
users/{uid}/
  user_profiles                  ← UserProfile doc (onboarding flags, has_partner, etc.)
  months/{monthId}/              ← monthId format: "YYYY-MM"
    ingresos/                    ← Income entries
    facturas/                    ← Bills (recurring, auto-copied from previous month)
    gastos/                      ← Expenses
    ahorros/                     ← Savings
    pareja/                      ← Partner shared expenses
    deudas/                      ← Monthly debt section entries
    fondos_ahorro_monthly/
    deudas_monthly/
  fondos_ahorro/                 ← Savings goal definitions
  fondos_ahorro_monthly/         ← Per-month savings goal progress
  deudas/                        ← Debt master records
  deudas_monthly/                ← Monthly debt payments
  ingreso_templates/             ← Income source templates (synced → ingresos on month create)
  ahorro_templates/              ← Savings category templates (synced → ahorros on month create)
  inversiones/                   ← Gold investment records
  pensiones_aportaciones/        ← Pension contributions
```

**No Firestore Rules (RLS):** Access is controlled in-app by filtering on `user_id`. Always filter by the authenticated user's UID in service queries.

### Key Patterns

**Month initialization** (`MonthService.getOrCreateMonth()`): Creates a month document on first access and automatically: copies recurring `facturas` from the previous month, syncs `ingreso_templates` → `ingresos`, syncs `ahorro_templates` → `ahorros`, and creates `pareja` entries if `has_partner = true` on the user profile.

**Month navigation**: Components hold a `monthOffset = signal(0)` and compute `currentYear`/`currentMonth` from it. Query params (e.g. `?year=2025&month=3`) preserve the selected month when navigating between sections.

**BudgetTableComponent**: The core UI primitive used by every budget section. Receives `items[]`, `title`, `tooltip` inputs and emits `itemAdded`, `itemUpdated`, `itemDeleted` events. Renders columns: Concepto / Presupuesto / Real / Diferencia (with green/red CSS classes). Section components wrap this with Firestore CRUD logic.

**Generic SectionService**: A single service handles gastos, ahorros, pareja, and deudas sections by accepting the subcollection name as a parameter.

**State management**: Components use `signal()` for local state and `toSignal(observable$)` to bridge Firestore observables. No component shares state via a global store — each page manages its own.

**Google OAuth**: Uses `signInWithRedirect()` (full-page redirect). `AuthService` exposes a `redirectHandled` Promise that `authGuard` awaits to prevent race conditions on the OAuth callback page.

**Gold prices** (`GoldPriceService`): Calls `metals.dev` API, caches the result in `localStorage` with a monthly request quota of 100 calls. Falls back to last stored price on failure.

### Route Guards

Two guards protect authenticated routes:
1. `authGuard` — checks Firebase auth state; redirects to `/auth/login` if unauthenticated
2. `onboardingGuard` — checks `UserProfile.onboarding_completed`; redirects to `/onboarding` if false

All protected routes apply both guards. Public routes: `/auth/login`, `/auth/register`, `/auth/callback`.

### Environments

`src/environments/environment.ts` (dev) and `environment.prod.ts` (prod) both contain the Firebase config. The Gold API key (`goldApiKey`) is also stored here. The `angular.json` `fileReplacements` swap the file at build time.
