import { Injectable } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { FondoAhorro, FondoAhorroMonthly } from '../models';

@Injectable({ providedIn: 'root' })
export class FondosAhorroService {
  constructor(private supabase: SupabaseService) {}

  async getActive(userId: string): Promise<FondoAhorro[]> {
    const { data } = await this.supabase.client
      .from('fondos_ahorro').select('*').eq('user_id', userId).eq('is_active', true)
      .order('created_at', { ascending: true });
    return (data ?? []) as FondoAhorro[];
  }

  async getArchived(userId: string): Promise<FondoAhorro[]> {
    const { data } = await this.supabase.client
      .from('fondos_ahorro').select('*').eq('user_id', userId).eq('is_active', false)
      .order('created_at', { ascending: true });
    return (data ?? []) as FondoAhorro[];
  }

  async create(fondo: Omit<FondoAhorro, 'id'>): Promise<FondoAhorro> {
    const { data, error } = await this.supabase.client
      .from('fondos_ahorro').insert(fondo).select().single();
    if (error) throw error;
    return data as FondoAhorro;
  }

  async update(id: string, patch: Partial<Pick<FondoAhorro, 'name' | 'total_amount' | 'monthly_amount' | 'num_months'>>): Promise<void> {
    const { error } = await this.supabase.client
      .from('fondos_ahorro').update(patch).eq('id', id);
    if (error) throw error;
  }

  async archive(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('fondos_ahorro').update({ is_active: false }).eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('fondos_ahorro').delete().eq('id', id);
    if (error) throw error;
  }

  async deactivate(id: string): Promise<void> {
    return this.archive(id);
  }

  async getMonthlyByMonth(monthId: string): Promise<FondoAhorroMonthly[]> {
    const { data } = await this.supabase.client
      .from('fondos_ahorro_monthly').select('*').eq('month_id', monthId);
    return (data ?? []) as FondoAhorroMonthly[];
  }

  async upsertMonthly(item: Omit<FondoAhorroMonthly, 'id'>): Promise<void> {
    const { error } = await this.supabase.client
      .from('fondos_ahorro_monthly').upsert(item, { onConflict: 'fondo_id,month_id' });
    if (error) throw error;
  }

  async updateMonthlyReal(fondoId: string, monthId: string, real: number): Promise<void> {
    const { error } = await this.supabase.client
      .from('fondos_ahorro_monthly')
      .update({ real })
      .eq('fondo_id', fondoId)
      .eq('month_id', monthId);
    if (error) throw error;
  }

  async countCompletedMonths(fondoId: string): Promise<number> {
    const { count } = await this.supabase.client
      .from('fondos_ahorro_monthly')
      .select('*', { count: 'exact', head: true })
      .eq('fondo_id', fondoId);
    return count ?? 0;
  }
}
