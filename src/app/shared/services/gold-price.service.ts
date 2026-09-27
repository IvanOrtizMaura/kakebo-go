import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

interface GoldApiResponse {
  price_gram_24k: number;
  price_gram_22k: number;
  price_gram_21k: number;
  price_gram_18k: number;
  price_gram_14k: number;
  price_gram_10k: number;
  currency: string;
}

interface GoldPriceCache {
  fetchedAt: string;
  price: number; // 24k EUR/g
}

// Cache for full karat price points (permanent for historical, 23h for current)
interface PricePointCache {
  p24k: number; p22k: number; p21k: number;
  p18k: number; p14k: number; p10k: number;
}

const CURRENT_CACHE_KEY = 'kakebo_gold_current';
const HIST_POINT_PREFIX = 'kakebo_gold_point_'; // full price point per date
const CURRENT_CACHE_TTL_MS = 23 * 60 * 60 * 1000;

// goldapi.io free tier allows 100 requests/month. Backfilling a 12-month chart
// burns 12 at once, so every call goes through a counter that hard-stops before
// the plan runs out and leaves headroom for the daily spot price.
const REQ_COUNT_PREFIX = 'kakebo_gold_reqs_';
const MONTHLY_REQUEST_CAP = 90;

@Injectable({ providedIn: 'root' })
export class GoldPriceService {

  async getGoldPriceEurPerGram(): Promise<number | null> {
    try {
      const raw = localStorage.getItem(CURRENT_CACHE_KEY);
      if (raw) {
        const cache: GoldPriceCache = JSON.parse(raw);
        if ((Date.now() - new Date(cache.fetchedAt).getTime()) < CURRENT_CACHE_TTL_MS) {
          return cache.price;
        }
      }
    } catch { /* ignore */ }

    const point = await this.fetchPricePoint('');
    if (point !== null) {
      try {
        localStorage.setItem(CURRENT_CACHE_KEY, JSON.stringify({
          fetchedAt: new Date().toISOString(), price: point.p24k
        }));
      } catch { /* storage full */ }
    }
    return point?.p24k ?? null;
  }

  // Returns the 24k spot price for a date — caller adjusts for karat
  async getSpot24kForDate(dateStr: string): Promise<number | null> {
    const today = this.todayStr();
    const point = dateStr >= today
      ? await this.getCurrentPricePoint()
      : await this.getHistoricalPricePoint(dateStr);
    return point?.p24k ?? null;
  }

  getLastUpdated(): { date: Date; requestsUsed: number } | null {
    try {
      const raw = localStorage.getItem(CURRENT_CACHE_KEY);
      if (!raw) return null;
      const cache: GoldPriceCache = JSON.parse(raw);
      return { date: new Date(cache.fetchedAt), requestsUsed: 0 };
    } catch { return null; }
  }

  /**
   * 24k EUR/g for one month, or null if it can't be resolved.
   *
   * Past months are sampled on the 15th (a mid-month weekday is far likelier to
   * have a quote than the 1st or 31st) and cached permanently in localStorage,
   * since a historical price never changes. The current month goes through the
   * 23h spot cache, so asking for it repeatedly is free.
   *
   * Callers must fetch only the months they actually need — every miss here is
   * one request off a 100/month plan.
   */
  async getMonthPrice(year: number, month: number): Promise<number | null> {
    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    const point = isCurrentMonth
      ? await this.getCurrentPricePoint()
      : await this.getHistoricalPricePoint(`${year}-${String(month).padStart(2, '0')}-15`);
    return point?.p24k ?? null;
  }

  /** Requests spent this calendar month, and what's left of the plan. */
  getRequestBudget(): { used: number; cap: number; remaining: number } {
    const used = this.requestsThisMonth();
    return { used, cap: MONTHLY_REQUEST_CAP, remaining: Math.max(0, MONTHLY_REQUEST_CAP - used) };
  }

  // ── internals ────────────────────────────────────────────────────────────────

  private reqCountKey(): string {
    const d = new Date();
    return `${REQ_COUNT_PREFIX}${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private requestsThisMonth(): number {
    try {
      return Number(localStorage.getItem(this.reqCountKey())) || 0;
    } catch { return 0; }
  }

  private countRequest(): void {
    try {
      localStorage.setItem(this.reqCountKey(), String(this.requestsThisMonth() + 1));
    } catch { /* storage full */ }
  }

  private todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private priceForPureza(p: PricePointCache, pureza: number): number {
    if (pureza >= 990)       return p.p24k;
    if (pureza >= 900)       return p.p22k;
    if (pureza >= 860)       return p.p21k;
    if (pureza >= 730)       return p.p18k;
    if (pureza >= 560)       return p.p14k;
    if (pureza >= 380)       return p.p10k;
    // Below 10k: calculate proportionally from 24k
    return p.p24k * (pureza / 999.9);
  }

  private async getCurrentPricePoint(): Promise<PricePointCache | null> {
    try {
      const raw = localStorage.getItem(CURRENT_CACHE_KEY + '_point');
      if (raw) {
        const entry: { fetchedAt: string; point: PricePointCache } = JSON.parse(raw);
        if ((Date.now() - new Date(entry.fetchedAt).getTime()) < CURRENT_CACHE_TTL_MS) {
          return entry.point;
        }
      }
    } catch { /* ignore */ }
    const point = await this.fetchPricePoint('');
    if (point) {
      try {
        localStorage.setItem(CURRENT_CACHE_KEY + '_point', JSON.stringify({
          fetchedAt: new Date().toISOString(), point
        }));
      } catch { /* storage full */ }
    }
    return point;
  }

  private async getHistoricalPricePoint(dateStr: string): Promise<PricePointCache | null> {
    const key = `${HIST_POINT_PREFIX}${dateStr}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as PricePointCache;
    } catch { /* ignore */ }
    const apiDate = dateStr.replace(/-/g, '');
    const point = await this.fetchPricePoint(apiDate);
    if (point) {
      try { localStorage.setItem(key, JSON.stringify(point)); } catch { /* storage full */ }
    }
    return point;
  }

  private async fetchPricePoint(date: string): Promise<PricePointCache | null> {
    if (!environment.goldApiKey) {
      console.warn('[GoldPrice] goldApiKey not configured');
      return null;
    }
    if (this.requestsThisMonth() >= MONTHLY_REQUEST_CAP) {
      console.warn('[GoldPrice] monthly request cap reached — not calling the API');
      return null;
    }

    const path = date ? `/XAU/EUR/${date}` : '/XAU/EUR';
    try {
      this.countRequest();
      const res = await fetch(`https://www.goldapi.io/api${path}`, {
        headers: { 'x-access-token': environment.goldApiKey }
      });
      if (!res.ok) { console.error('[GoldPrice] status', res.status); return null; }
      const d = await res.json() as GoldApiResponse;
      if (!d?.price_gram_24k) return null;
      return {
        p24k: d.price_gram_24k, p22k: d.price_gram_22k, p21k: d.price_gram_21k,
        p18k: d.price_gram_18k, p14k: d.price_gram_14k, p10k: d.price_gram_10k
      };
    } catch (e) { console.error('[GoldPrice] fetch error', e); return null; }
  }
}
