import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface GoldPriceCache {
  price: number;
  updatedAt: number;      // epoch ms
  monthYear: string;      // e.g. "2026-06"
  requestsThisMonth: number;
}

interface MetalsDevResponse {
  status: string;
  currency: string;
  unit: string;
  metals: { gold: number; [key: string]: number };
}

const CACHE_KEY = 'kakebo_gold_price';
const MONTHLY_LIMIT = 100;

@Injectable({ providedIn: 'root' })
export class GoldPriceService {
  private readonly http = inject(HttpClient);

  async getGoldPriceEurPerGram(): Promise<number | null> {
    try {
      const now = new Date();
      const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Load cache
      const raw = localStorage.getItem(CACHE_KEY);
      let cache: GoldPriceCache | null = raw ? JSON.parse(raw) : null;

      // Reset counter if new month
      if (cache && cache.monthYear !== currentMonthYear) {
        cache = null;
      }

      const requestsUsed = cache?.requestsThisMonth ?? 0;
      const ttlMs = this.calculateTTL(requestsUsed, now);

      // Return cached price if still fresh
      if (cache && (now.getTime() - cache.updatedAt) < ttlMs) {
        return cache.price;
      }

      // No requests left this month
      if (requestsUsed >= MONTHLY_LIMIT) {
        console.warn('Límite mensual de precio del oro alcanzado.');
        return cache?.price ?? null;
      }

      // Fetch fresh price
      const url = `https://api.metals.dev/v1/latest?api_key=${environment.goldApiKey}&currency=EUR&unit=g`;
      const response = await this.http.get<MetalsDevResponse>(url).toPromise();

      if (!response || response.status !== 'success' || !response.metals?.gold) {
        return cache?.price ?? null;
      }

      // Save to localStorage
      const updated: GoldPriceCache = {
        price: response.metals.gold,
        updatedAt: now.getTime(),
        monthYear: currentMonthYear,
        requestsThisMonth: requestsUsed + 1
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(updated));

      return response.metals.gold;
    } catch (error) {
      console.error('Error fetching gold price:', error);
      // Return stale price if available rather than null
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as GoldPriceCache).price : null;
    }
  }

  getLastUpdated(): { date: Date; requestsUsed: number } | null {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache: GoldPriceCache = JSON.parse(raw);
    return { date: new Date(cache.updatedAt), requestsUsed: cache.requestsThisMonth };
  }
  private calculateTTL(requestsUsed: number, now: Date): number {
    const remaining = MONTHLY_LIMIT - requestsUsed;
    if (remaining <= 0) return Infinity;

    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    const msLeft = endOfMonth - now.getTime();

    return msLeft / remaining; // ms per request
  }
}
