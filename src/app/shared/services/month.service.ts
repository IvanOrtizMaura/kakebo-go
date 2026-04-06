import { Injectable } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { Month } from '../models';

@Injectable({ providedIn: 'root' })
export class MonthService {
  constructor(private supabase: SupabaseService) {}

  async getOrCreateMonth(userId: string, year: number, month: number): Promise<Month> {
    const { data: existing } = await this.supabase.client
      .from('months')
      .select('*')
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)
      .single();

    if (existing) {
      await Promise.all([
        this.syncAhorroTemplates(userId, existing as Month),
        this.syncParejaFromProfile(userId, existing as Month)
      ]);
      return existing as Month;
    }

    const { data: created, error } = await this.supabase.client
      .from('months')
      .insert({ user_id: userId, year, month })
      .select()
      .single();

    if (error) throw error;

    await Promise.all([
      this.copyRecurringFacturas(userId, created as Month),
      this.copyIngresoTemplates(userId, created as Month),
      this.syncAhorroTemplates(userId, created as Month),
      this.syncParejaFromProfile(userId, created as Month)
    ]);

    return created as Month;
  }

  private async copyRecurringFacturas(userId: string, newMonth: Month): Promise<void> {
    const prevYear = newMonth.month === 1 ? newMonth.year - 1 : newMonth.year;
    const prevMonthNum = newMonth.month === 1 ? 12 : newMonth.month - 1;

    const { data: prevMonthRecord } = await this.supabase.client
      .from('months')
      .select('id')
      .eq('user_id', userId)
      .eq('year', prevYear)
      .eq('month', prevMonthNum)
      .single();

    if (!prevMonthRecord) return;

    const { data: recurring } = await this.supabase.client
      .from('facturas')
      .select('*')
      .eq('month_id', prevMonthRecord.id)
      .eq('is_recurring', true);

    if (!recurring?.length) return;

    const copies = recurring.map(({ id: _id, month_id: _mid, real: _r, ...f }) => ({
      ...f,
      month_id: newMonth.id,
      real: 0,
      is_recurring: false
    }));

    await this.supabase.client.from('facturas').insert(copies);
  }

  private async copyIngresoTemplates(userId: string, newMonth: Month): Promise<void> {
    const { data: templates } = await this.supabase.client
      .from('ingreso_templates')
      .select('*')
      .eq('user_id', userId)
      .order('order_index');

    if (!templates?.length) return;

    const copies = templates.map((t: { fuente: string; esperado: number; dia_de_paga: string | null; order_index: number }, idx: number) => ({
      month_id: newMonth.id,
      user_id: userId,
      fuente: t.fuente,
      esperado: t.esperado,
      real: 0,
      dia_de_paga: t.dia_de_paga,
      depositado: false,
      order_index: idx
    }));

    await this.supabase.client.from('ingresos').insert(copies);
  }

  private async syncAhorroTemplates(userId: string, month: Month): Promise<void> {
    const [templates, existing] = await Promise.all([
      this.supabase.client.from('ahorro_templates').select('name, presupuestado, order_index')
        .eq('user_id', userId).order('order_index'),
      this.supabase.client.from('ahorros').select('name').eq('month_id', month.id)
    ]);

    if (!templates.data?.length) return;

    const existingNames = new Set((existing.data ?? []).map((a: { name: string }) => a.name));

    const toInsert = templates.data
      .filter((t: { name: string }) => !existingNames.has(t.name))
      .map((t: { name: string; presupuestado: number; order_index: number }, idx: number) => ({
        month_id: month.id,
        user_id: userId,
        name: t.name,
        presupuestado: t.presupuestado,
        real: 0,
        order_index: (existing.data?.length ?? 0) + idx
      }));

    if (toInsert.length) await this.supabase.client.from('ahorros').insert(toInsert);
  }

  private async syncParejaFromProfile(userId: string, month: Month): Promise<void> {
    const { data: profile } = await this.supabase.client
      .from('user_profiles')
      .select('has_partner, ingreso_oficial, pareja_ahorro_pct, pareja_gastos_pct')
      .eq('id', userId)
      .single();

    if (!profile || !profile.has_partner || !profile.ingreso_oficial) return;

    const { data: existing } = await this.supabase.client
      .from('pareja').select('name').eq('month_id', month.id);

    const existingNames = new Set((existing ?? []).map((p: { name: string }) => p.name));

    const toInsert = [];
    if (!existingNames.has('Ahorro pareja')) {
      toInsert.push({ month_id: month.id, user_id: userId, name: 'Ahorro pareja',
        presupuestado: (profile.ingreso_oficial * profile.pareja_ahorro_pct) / 100, real: 0, order_index: 0 });
    }
    if (!existingNames.has('Gastos pareja')) {
      toInsert.push({ month_id: month.id, user_id: userId, name: 'Gastos pareja',
        presupuestado: (profile.ingreso_oficial * profile.pareja_gastos_pct) / 100, real: 0, order_index: 1 });
    }

    if (toInsert.length) await this.supabase.client.from('pareja').insert(toInsert);
  }

  async getMonthsForYear(userId: string, year: number): Promise<Month[]> {
    const { data } = await this.supabase.client
      .from('months')
      .select('*')
      .eq('user_id', userId)
      .eq('year', year)
      .order('month');
    return (data ?? []) as Month[];
  }
}
