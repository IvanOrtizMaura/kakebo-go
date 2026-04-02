import { Injectable } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { Ingreso } from '../models';

@Injectable({ providedIn: 'root' })
export class IngresosService {
  constructor(private supabase: SupabaseService) {}

  async getByMonth(monthId: string): Promise<Ingreso[]> {
    const { data } = await this.supabase.client
      .from('ingresos')
      .select('*')
      .eq('month_id', monthId)
      .order('order_index');
    return (data ?? []) as Ingreso[];
  }

  async add(item: Omit<Ingreso, 'id'>): Promise<Ingreso> {
    const { data, error } = await this.supabase.client
      .from('ingresos').insert(item).select().single();
    if (error) throw error;
    return data as Ingreso;
  }

  async update(id: string, changes: Partial<Ingreso>): Promise<void> {
    const { error } = await this.supabase.client
      .from('ingresos').update(changes).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('ingresos').delete().eq('id', id);
    if (error) throw error;
  }
}
