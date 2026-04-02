import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { UserProfile } from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  constructor(private supabase: SupabaseService) {}

  async getProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabase.client
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) return null;
    return data as UserProfile;
  }

  async upsertProfile(profile: Partial<UserProfile> & { id: string }): Promise<void> {
    const { error } = await this.supabase.client
      .from('user_profiles')
      .upsert(profile);
    if (error) throw error;
  }
}
