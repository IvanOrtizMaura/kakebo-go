import { Injectable } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class SectionService {
  constructor(private supabase: SupabaseService) {}

  private crud(table: string) {
    return {
      getByMonth: async (monthId: string) => {
        const { data } = await this.supabase.client
          .from(table).select('*').eq('month_id', monthId).order('order_index');
        return data ?? [];
      },
      add: async (item: Record<string, unknown>) => {
        const { data, error } = await this.supabase.client
          .from(table).insert(item).select().single();
        if (error) throw error;
        return data;
      },
      update: async (id: string, changes: Record<string, unknown>) => {
        const { error } = await this.supabase.client
          .from(table).update(changes).eq('id', id);
        if (error) throw error;
      },
      remove: async (id: string) => {
        const { error } = await this.supabase.client
          .from(table).delete().eq('id', id);
        if (error) throw error;
      }
    };
  }

  readonly gastos = this.crud('gastos');
  readonly ahorros = this.crud('ahorros');
  readonly pareja = this.crud('pareja');
}
