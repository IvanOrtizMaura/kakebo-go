import { Injectable } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { Deuda, DeudaMonthly } from '../models';

@Injectable({ providedIn: 'root' })
export class DeudasService {
  constructor(private supabase: SupabaseService) {}

  async getActive(userId: string): Promise<Deuda[]> {
    const { data } = await this.supabase.client
      .from('deudas').select('*').eq('user_id', userId).eq('is_active', true)
      .order('total_amount', { ascending: true });
    return (data ?? []) as Deuda[];
  }

  async getArchived(userId: string): Promise<Deuda[]> {
    const { data } = await this.supabase.client
      .from('deudas').select('*').eq('user_id', userId).eq('is_active', false)
      .order('total_amount', { ascending: true });
    return (data ?? []) as Deuda[];
  }

  async create(deuda: Omit<Deuda, 'id'>): Promise<Deuda> {
    const { data, error } = await this.supabase.client
      .from('deudas').insert(deuda).select().single();
    if (error) throw error;
    return data as Deuda;
  }

  async update(id: string, patch: Partial<Pick<Deuda, 'name' | 'num_months' | 'monthly_payment' | 'start_year' | 'start_month'>>): Promise<void> {
    const { error } = await this.supabase.client
      .from('deudas').update(patch).eq('id', id);
    if (error) throw error;
  }

  async archive(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('deudas').update({ is_active: false }).eq('id', id);
    if (error) throw error;
  }

  async unarchive(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('deudas').update({ is_active: true }).eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    // Eliminar registros mensuales primero
    await this.supabase.client.from('deudas_monthly').delete().eq('deuda_id', id);
    // Luego eliminar la deuda
    const { error } = await this.supabase.client
      .from('deudas').delete().eq('id', id);
    if (error) throw error;
  }

  async getMonthlyByMonth(monthId: string): Promise<DeudaMonthly[]> {
    const { data } = await this.supabase.client
      .from('deudas_monthly').select('*').eq('month_id', monthId);
    return (data ?? []) as DeudaMonthly[];
  }

  async upsertMonthly(item: Omit<DeudaMonthly, 'id'>): Promise<void> {
    const { error } = await this.supabase.client
      .from('deudas_monthly').upsert(item, { onConflict: 'deuda_id,month_id' });
    if (error) throw error;
  }

  async applyPayment(deudaId: string, monthId: string, amount: number): Promise<void> {
    const { data: deuda, error: deudaError } = await this.supabase.client
      .from('deudas').select('amount_remaining').eq('id', deudaId).single();
    if (deudaError || !deuda) throw deudaError;

    const newRemaining = Math.max(0, (deuda as Deuda).amount_remaining - amount);
    const isActive = newRemaining > 0;

    await this.supabase.client.from('deudas')
      .update({ amount_remaining: newRemaining, is_active: isActive })
      .eq('id', deudaId);

    await this.supabase.client.from('deudas_monthly')
      .update({ real: amount })
      .eq('deuda_id', deudaId)
      .eq('month_id', monthId);
  }
}
