export interface UserProfile {
  id: string;
  monthly_net_income: number;
  fixed_expenses_description: string;
  savings_percentage: number;
  has_high_interest_debt: boolean;
  has_partner: boolean;
  onboarding_completed: boolean;
  ingreso_oficial: number;
  pareja_ahorro_pct: number;
  pareja_gastos_pct: number;
}

export interface Month {
  id: string;
  user_id: string;
  year: number;
  month: number;
}

export interface Ingreso {
  id: string;
  month_id: string;
  user_id: string;
  fuente: string;
  dia_de_paga: string | null;
  esperado: number;
  real: number;
  depositado: boolean;
  order_index: number;
}

export interface Factura {
  id: string;
  month_id: string;
  user_id: string;
  name: string;
  fecha: string | null;
  presupuestado: number;
  real: number;
  is_recurring: boolean;
  order_index: number;
}

export interface Gasto {
  id: string;
  month_id: string;
  user_id: string;
  name: string;
  presupuestado: number;
  real: number;
  tipo: 'fijos' | 'variables';
  order_index: number;
}

export interface Ahorro {
  id: string;
  month_id: string;
  user_id: string;
  name: string;
  presupuestado: number;
  real: number;
  order_index: number;
}

export interface Pareja {
  id: string;
  month_id: string;
  user_id: string;
  name: string;
  presupuestado: number;
  real: number;
  order_index: number;
}

export interface FondoAhorro {
  id: string;
  user_id: string;
  name: string;
  total_amount: number;
  monthly_amount: number;
  num_months: number;
  start_year: number;
  start_month: number;
  is_active: boolean;
}

export interface FondoAhorroMonthly {
  id: string;
  fondo_id: string;
  month_id: string;
  user_id: string;
  presupuestado: number;
  real: number;
}

export interface Deuda {
  id: string;
  user_id: string;
  name: string;
  type: 'bank' | 'savings';
  principal_amount: number;
  total_amount: number;
  interest_rate: number;
  monthly_payment: number;
  amount_remaining: number;
  is_active: boolean;
  start_year?: number | null;
  start_month?: number | null;
  num_months?: number | null;
}

export interface DeudaMonthly {
  id: string;
  deuda_id: string;
  month_id: string;
  user_id: string;
  presupuestado: number;
  real: number;
}

export interface AhorroTemplate {
  id: string;
  user_id: string;
  name: string;
  presupuestado: number;
  order_index: number;
  created_at?: string;
}

export interface BudgetItem {  id: string;
  name: string;
  presupuestado: number;
  real: number;
  [key: string]: unknown;
}
