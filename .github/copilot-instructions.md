# Kakebo Go - Copilot Instructions

Personal finance management app inspired by the Japanese Kakebo method. Angular 19 + PrimeNG + Supabase.

## Commands

All commands run from `kakebo-go/`:

```bash
pnpm install          # Install dependencies
pnpm start            # Dev server at http://localhost:4200
pnpm build            # Production build to dist/
pnpm test             # Run all Karma/Jasmine tests
ng test --include=**/feature.spec.ts   # Run single test file
ng generate component features/my-feature --standalone  # Scaffold component
```

## Architecture

```
kakebo-go/
├── src/app/
│   ├── core/           # Singletons: SupabaseService, AuthService, guards
│   ├── features/       # Route-level pages: auth/, dashboard/, month/, onboarding/, settings/
│   ├── layout/         # AppLayoutComponent + SidebarComponent (shell)
│   └── shared/
│       ├── components/ # Reusable UI: BudgetTableComponent
│       ├── models/     # TypeScript interfaces (index.ts barrel)
│       └── services/   # Domain services: MonthService, SectionService, etc.
└── supabase/migrations/  # PostgreSQL schema (RLS-enabled)
```

### Data Flow

1. **SupabaseService** (`core/supabase/`) - singleton wrapping `@supabase/supabase-js` client
2. **Domain services** (`shared/services/`) - one per table: `IngresosService`, `FacturasService`, `DeudasService`, etc.
3. **SectionService** - generic CRUD factory for simple tables (`gastos`, `ahorros`, `pareja`)
4. **Components** consume services, update signals, emit events to parent

### Route Structure

- `/auth/login`, `/auth/register`, `/auth/callback` - public auth flow
- `/onboarding` - stepper for first-time user profile setup
- `/dashboard` - annual overview (requires auth + completed onboarding)
- `/m/:year/:month` - monthly budget view with 8 sections

Guards: `authGuard` → `onboardingGuard` → protected routes.

## Key Conventions

### Standalone Components
All components use `standalone: true`. No NgModules. Import dependencies directly in the component's `imports` array.

### Signals for State
Use Angular signals (`signal()`, `computed()`) for reactive state. Avoid BehaviorSubject unless interop is needed.

### Budget Section Pattern
Each monthly section (Ingresos, Facturas, Gastos, Ahorros, Fondos, Pareja, Deudas) follows:
- Dedicated `*-table.component.ts` in `features/month/sections/`
- Inputs: `items`, `monthId`, `userId`
- Output: `(changed)` event for parent to reload
- Uses `BudgetTableComponent` for standard presupuestado/real columns

### BudgetTableComponent
Reusable table in `shared/components/budget-table/`:
- `@Input() items: BudgetRow[]` - rows with `id`, `name`, `presupuestado`, `real`
- `@Output() itemAdded`, `itemUpdated`, `itemDeleted` - CRUD events
- Calculates diff (presupuestado - real) with color classes: `.positive`, `.negative`, `.neutral`

### Supabase & RLS
- All tables have Row-Level Security: `auth.uid() = user_id`
- User data is scoped by `user_id` FK to `auth.users`
- `months` table links year/month to user; sections reference `month_id`

### Styling
- Global CSS variables in `styles.scss`: `--kakebo-indigo`, `--kakebo-rojo`, `--kakebo-crema`, etc.
- Component styles use `.kakebo-card`, `.section-header`, `.amount-positive`, `.amount-negative`
- PrimeNG theme: Aura preset customized with kakebo colors in `app.config.ts`
- Mobile-first: breakpoint at 768px

### Spanish UI
All user-facing text is in Spanish. Table columns: "Concepto", "Presupuesto", "Real", "Diferencia".

## Database Schema (Supabase)

Core tables (all have `user_id` + RLS):
- `user_profiles` - onboarding data, `has_partner` flag
- `months` - unique (user_id, year, month)
- `ingresos` - income with `esperado`/`real` + `dia_de_paga`
- `facturas` - recurring bills with `is_recurring` flag
- `gastos` - expenses with `tipo: 'fijos'|'variables'`
- `ahorros` - savings
- `pareja` - shared expenses (only if `has_partner = true`)
- `fondos_ahorro` (master) + `fondos_ahorro_monthly` - savings funds with progress tracking
- `deudas` (master) + `deudas_monthly` - debts with `type: 'bank'|'savings'`

See `supabase/migrations/001_initial_schema.sql` for full schema.

## Environment

Configure Supabase in `src/environments/environment.ts`:
```typescript
export const environment = {
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseKey: 'your-anon-key'
};
```
