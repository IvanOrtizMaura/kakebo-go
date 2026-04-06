# Plan: Kakebo Go - Gestión Económica Doméstica

## TL;DR
App Angular 19 (standalone) + PrimeNG + Supabase Mobile-First para gestión presupuestaria mensual. Inspirada en un Excel con 8 secciones por mes. Tagline: "El método japonés en tu bolsillo". Despliegue en Vercel.

## Logo
- Archivo: `Gemini_Generated_Image_poe911poe911poe9.png`
- Nombre: **Kakebo Go** ("Kakebo" en estilo pincel japonés + "Go" en kakebo-rojo, fondo kakebo-crema)
- Icono: monedero tipo nudo celta entrelazado en kakebo-indigo + kakebo-rojo, cierre en kakebo-dorado, flecha ascendente roja
- Usar el PNG como asset en `src/assets/logo.png`

---

## Decisiones clave
- Angular 19 standalone components + PrimeNG (tema personalizado con variables kakebo)
- Supabase: Auth (email + Google OAuth) + PostgreSQL + RLS por usuario
- Mobile First, diseño limpio/minimalista
- Presupuestado + Real en TODAS las tablas (diferencia calculada)
- Facturas se auto-copian del mes anterior (editables)
- Sección Pareja solo visible si onboarding `has_partner = true`
- Deudas: tipo 'bank' (con interés) o 'savings' (penalización 5% fijo)
- Fondos de Ahorro: al 100% → dialog pregunta si reiniciar (si sí → pide nuevo total)
- Navegación: sidebar con 12 meses del año + resumen anual (arriba)
- Vista inicial: Resumen Anual + mes actual destacado
- Años anteriores siguen accesibles

## Color palette
```
--kakebo-indigo: #1E3A5F
--kakebo-rojo: #D9381E
--kakebo-crema: #F9F6F0
--kakebo-dorado: #C5A059
--kakebo-texto-principal: #2C3E50
--kakebo-texto-secundario: #7F8C8D
--kakebo-borde: #E0E6ED
```

---

## Database Schema (Supabase)

### user_profiles
- id (UUID, FK auth.users), monthly_net_income, fixed_expenses_description, savings_percentage, has_high_interest_debt, has_partner, onboarding_completed

### months
- id, user_id, year, month (1-12), UNIQUE(user_id, year, month)

### ingresos
- id, month_id, user_id, fuente (name), dia_de_paga (date), esperado (numeric), real (numeric), depositado (boolean), order_index
- Columnas UI: Fuente | Día de Paga | Esperado | Real | Depositado (checkbox)

### facturas
- id, month_id, user_id, name, fecha (date, fecha prevista de pago), presupuestado, real, is_recurring, order_index
- Columnas UI: Descripción | Presupuesto | Fecha | Real | Diferencia

### gastos
- id, month_id, user_id, name, presupuestado, real, tipo ('fijos'|'variables'), order_index
- Columnas UI: Descripción | Presupuesto | Real | Diferencia | Tipo (badge FIJO/VARIABLE)

### ahorros
- id, month_id, user_id, name, presupuestado, real, order_index

### pareja
- id, month_id, user_id, name, presupuestado, real, order_index

### fondos_ahorro (master)
- id, user_id, name, total_amount, monthly_amount (total/11), start_year, start_month, is_active

### fondos_ahorro_monthly
- id, fondo_id, month_id, user_id, presupuestado, real

### deudas (master)
- id, user_id, name, type ('bank'|'savings'), total_amount, interest_rate, monthly_payment, amount_remaining, is_active
- amount_remaining: saldo pendiente actual (empieza igual a total_amount, se va reduciendo con los pagos reales)

### deudas_monthly
- id, deuda_id, month_id, user_id, presupuestado, real

### All tables: RLS activo, solo el propietario puede ver/editar sus datos

---

## Routing
```
/ → redirect inteligente
/auth/login
/onboarding
/dashboard (resumen anual)
/m/:year/:month (vista mensual)
```

---

## Phases

### Phase 0 — Project Bootstrap
1. `ng new kakebo --routing --style=scss --strict` (Angular 19)
2. `npm i primeng @primeng/themes primeicons`
3. Configurar tema PrimeNG (preset Aura customizado con colores kakebo)
4. Variables CSS globales (kakebo-*) en styles.scss
5. Configurar Supabase client (`@supabase/supabase-js`) + `environment.ts`
6. Vercel project linkado al repo

### Phase 1 — Auth
1. `SupabaseService` (singleton, expone auth + db client)
2. `AuthService` (login email, login Google, logout, sesión actual)
3. `AuthGuard` (redirige a /auth/login si no hay sesión)
4. `OnboardingGuard` (redirige a /onboarding si `onboarding_completed = false`)
5. LoginComponent: card centrada, logo, email/password form + botón Google, link "crear cuenta"
6. RegisterComponent (inline en login o ruta separada /auth/register)

### Phase 2 — Onboarding
1. OnboardingComponent: PrimeNG Stepper de 5 pasos
   - Paso 1: Ingreso neto mensual (InputNumber)
   - Paso 2: Gastos innegociables descripción (Textarea + hint de para qué sirven)
   - Paso 3: % ahorro objetivo (Slider + InputNumber)
   - Paso 4: ¿Deudas con interés alto? (Yes/No toggle)
   - Paso 5: ¿Tienes pareja? (Yes/No toggle)
2. `UserProfileService` → `upsert` en `user_profiles`
3. Al completar: marcar `onboarding_completed = true` → navegar a /dashboard

### Phase 3 — Core Shell Layout
1. `AppLayoutComponent`: sidebar + main content area (shell)
2. `SidebarComponent`:
   - Header: logo Kakebo + nombre usuario
   - Item "Resumen Anual" (icono + link /dashboard)
   - Lista 12 meses del año seleccionado
   - Selector de año (año actual + años anteriores)
   - Mobile: sidebar colapsable (drawer)
3. Routing guards aplicados al shell
4. Responsive breakpoints: mobile <768px → sidebar como bottom-nav o hamburger

### Phase 4 — Supabase Database
1. Ejecutar script SQL de creación de todas las tablas
2. Activar RLS en todas las tablas
3. Políticas RLS: `USING (user_id = auth.uid())`
4. `MonthService`: get or create month record
5. Services por sección: `IngresosService`, `FacturasService`, etc.

### Phase 5 — Componente base reutilizable: BudgetTableComponent
- Input: `title`, `items`, `sectionType`, `showCategories?`
- Cada fila: nombre | presupuestado | real | diferencia (calculada = presupuestado - real)
- Acciones por fila: editar inline, eliminar
- Fila de totales al pie
- Botón "+ Añadir" al pie de la tabla
- Diferencia: verde si positivo, rojo si negativo

### Phase 6 — Vista Mensual (MonthViewComponent)
Estructura: ruta `/m/:year/:month`

**Hero del mes (sticky top):**
- Pill: INGRESOS TOTALES (real) | GASTOS TOTALES (real)
- Cuenta regresiva al cobro: "Día de paga en X días" (basado en `dia_de_paga` del ingreso principal)
- Queda por gastar: ingresos reales − gastos reales
- Queda para presupuestar: ingresos presupuestados − suma de presupuestos

**Secciones en orden:**
1. **Resumen de Presupuesto** (tabla derivada primero)
2. **Ingresos** — columnas: Fuente | Día de Paga | Esperado | Real | Depositado (checkbox)
3. **Facturas** — columnas: Descripción | Presupuesto | Fecha | Real | Diferencia; auto-copiar `is_recurring=true` del mes anterior
4. **Gastos** — columnas: Descripción | Presupuesto | Real | Diferencia | Tipo (badge FIJO/VARIABLE)
5. **Ahorros** — columnas: Descripción | Presupuesto | Real | Diferencia
6. **Fondos de Ahorro** — componente especial con barra de progreso + lógica al 100%
7. **Pareja** — solo si `has_partner = true` en perfil
8. **Deudas** — componente especial con tipo de deuda, cálculo de interés, progreso

### Phase 7 — Fondos de Ahorro (lógica especial)
- `FondosAhorroComponent`: lista de fondos activos
- Barra de progreso por fondo (meses completados / 11)
- Al llegar al 100%: `ConfirmDialog` → "¿Quieres reiniciar este fondo?" → si sí: `Dialog` pide nuevo total → crea nuevo fondo
- Mensual: auto-generar `fondos_ahorro_monthly` para el mes activo con `presupuestado = total/11`

### Phase 8 — Deudas (lógica especial)
- `DeudasComponent`: lista de deudas activas
- Cada deuda muestra: nombre, importe total pendiente (negativo, ej. PUMA -19.765€), cuota mensual presupuestada
- Al crear: elegir tipo ('bank' → pide interés %, 'savings' → fija 5% de penalización)
- Mensual (`deudas_monthly`): presupuestado = cuota mensual, real puede ser mayor (amortización extra puntual)
- Progreso: (total_amount − amount_remaining) / total_amount (barra de progreso)
- Al actualizar `real` del mes: restar de `amount_remaining` en deuda master
- Cuando `amount_remaining <= 0`: marcar `is_active = false` → se archiva
- Vista de deudas archivadas accesible desde un toggle/botón

### Phase 9 — Resumen de Presupuesto
- Tabla con filas: Ingreso | Facturas | Gastos | Ahorros | Fondos Ahorros | Pareja | Deudas
- Columnas: Total Presupuestado | Total Real | Diferencia
- Fila **TOTAL**: suma de todos los gastos
- Fila **CANTIDAD RESTANTE**: Ingresos Esperados − Total Presupuestado | Ingresos Reales − Total Real
- Calculado en el frontend desde los totales de cada sección (no consulta extra)
- Misma estructura que el Excel: la fila de Ingresos usa 'Esperado' como presupuestado

### Phase 10 — Dashboard Anual
- `DashboardComponent`: vista de /dashboard
- Cards por mes mostrando: Ingresos totales (real) / Gastos totales (real) / Balance
- Mes actual destacado con color kakebo-indigo
- Meses futuros sin datos (grises)
- Click en mes → navega a /m/:year/:month

---

## Relevant files (a crear)
- `src/app/core/supabase/supabase.service.ts`
- `src/app/core/auth/auth.service.ts`
- `src/app/core/auth/auth.guard.ts`
- `src/app/core/auth/onboarding.guard.ts`
- `src/app/features/auth/login/login.component.ts`
- `src/app/features/onboarding/onboarding.component.ts`
- `src/app/layout/app-layout/app-layout.component.ts`
- `src/app/layout/sidebar/sidebar.component.ts`
- `src/app/features/dashboard/dashboard.component.ts`
- `src/app/features/month/month-view/month-view.component.ts`
- `src/app/shared/components/budget-table/budget-table.component.ts`
- `src/app/features/month/sections/fondos-ahorro/fondos-ahorro.component.ts`
- `src/app/features/month/sections/deudas/deudas.component.ts`
- `src/app/features/month/sections/resumen/resumen.component.ts`
- `supabase/migrations/001_initial_schema.sql`

## Verification
1. Auth: login email/pass funciona, login Google redirige al callback correctamente
2. Onboarding: completar los 5 pasos guarda datos en `user_profiles` y no vuelve a mostrarse
3. Sidebar: los 12 meses del año se muestran, navegar entre ellos funciona
4. Facturas: al abrir Febrero, las facturas recurrentes de Enero aparecen pre-copiadas
5. Presupuestado/Real: introducir valores muestra la diferencia en verde/rojo correctamente
6. Pareja: si `has_partner=false`, la sección no aparece en el mes
7. Fondos: al llegar a 11 meses completados, aparece el diálogo de renovación
8. Deudas: pagar más de la cuota actualiza el progreso; al llegar al 100% desaparece
9. Resumen: los totales del resumen cuadran con la suma de cada sección
10. Dashboard: el mes actual está destacado y muestra datos reales
11. RLS: verificar con dos usuarios distintos que no ven datos del otro
12. Mobile: la app es usable en pantalla de 375px (iPhone SE)
