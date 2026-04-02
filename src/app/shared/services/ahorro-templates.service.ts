import { Injectable } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { AhorroTemplate } from '../models';

@Injectable({ providedIn: 'root' })
export class AhorroTemplatesService {
  constructor(private supabase: SupabaseService) {}

  async getAll(userId: string): Promise<AhorroTemplate[]> {
    const { data } = await this.supabase.client
      .from('ahorro_templates')
      .select('*')
      .eq('user_id', userId)
      .order('order_index');
    return (data ?? []) as AhorroTemplate[];
  }

  async add(template: Omit<AhorroTemplate, 'id' | 'created_at'>): Promise<void> {
    const { error } = await this.supabase.client
      .from('ahorro_templates').insert(template);
    if (error) throw error;
  }

  async update(id: string, patch: Partial<Pick<AhorroTemplate, 'name' | 'presupuestado'>>): Promise<void> {
    const { error } = await this.supabase.client
      .from('ahorro_templates').update(patch).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('ahorro_templates').delete().eq('id', id);
    if (error) throw error;
  }
}
