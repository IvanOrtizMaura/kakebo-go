import { Injectable } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { Factura } from '../models';

@Injectable({ providedIn: 'root' })
export class FacturasService {
  constructor(private supabase: SupabaseService) {}

  async getByMonth(monthId: string): Promise<Factura[]> {
    const { data } = await this.supabase.client
      .from('facturas').select('*').eq('month_id', monthId).order('order_index');
    return (data ?? []) as Factura[];
  }

  async add(item: Omit<Factura, 'id'>): Promise<Factura> {
    const { data, error } = await this.supabase.client
      .from('facturas').insert(item).select().single();
    if (error) throw error;
    return data as Factura;
  }

  async update(id: string, changes: Partial<Factura>): Promise<void> {
    const { error } = await this.supabase.client
      .from('facturas').update(changes).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('facturas').delete().eq('id', id);
    if (error) throw error;
  }
}
