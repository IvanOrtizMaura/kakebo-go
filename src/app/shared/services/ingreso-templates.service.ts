import { Injectable } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';

export interface IngresoTemplate {
  id: string;
  user_id: string;
  fuente: string;
  esperado: number;
  dia_de_paga: string | null;
  order_index: number;
}

@Injectable({ providedIn: 'root' })
export class IngresoTemplatesService {
  constructor(private supabase: SupabaseService) {}

  async getAll(userId: string): Promise<IngresoTemplate[]> {
    const { data } = await this.supabase.client
      .from('ingreso_templates')
      .select('*')
      .eq('user_id', userId)
      .order('order_index');
    return (data ?? []) as IngresoTemplate[];
  }

  async add(item: Omit<IngresoTemplate, 'id'>): Promise<IngresoTemplate> {
    const { data, error } = await this.supabase.client
      .from('ingreso_templates')
      .insert(item)
      .select()
      .single();
    if (error) throw error;
    return data as IngresoTemplate;
  }

  async update(id: string, changes: Partial<Pick<IngresoTemplate, 'fuente' | 'esperado'>>): Promise<void> {
    const { error } = await this.supabase.client
      .from('ingreso_templates')
      .update(changes)
      .eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('ingreso_templates')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
