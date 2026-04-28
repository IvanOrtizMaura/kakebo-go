import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private _client: SupabaseClient | null = null;

  get client(): SupabaseClient {
    if (!this._client) {
      this._client = createClient(
        environment.supabaseUrl,
        environment.supabaseKey,
        {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            storage: typeof window !== 'undefined' ? window.localStorage : undefined,
            lock: { acquireTimeout: 5000 }
          }
        }
      );
    }
    return this._client;
  }
}
