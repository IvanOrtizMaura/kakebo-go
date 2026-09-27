import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, getDocs, setDoc } from '@angular/fire/firestore';
import { GoldPriceSnapshot } from '../models';
import { GoldPriceService } from './gold-price.service';

export interface MonthlyPricePoint {
  month: number;
  year: number;
  price: number;
}

const MONTHS = 12;

/**
 * Firestore-backed cache of the monthly gold price, so the 12-month chart is
 * filled with real history instead of waiting a year to accumulate it.
 *
 * Why Firestore and not just localStorage: goldapi.io's free plan allows 100
 * requests/month, and a cold backfill costs 12. Persisting them server-side
 * means the backfill happens once per account, not once per browser.
 */
@Injectable({ providedIn: 'root' })
export class GoldPriceHistoryService {
  private readonly firestore = inject(Firestore);
  private readonly goldPriceService = inject(GoldPriceService);

  private historyCol(userId: string) {
    return collection(this.firestore, 'users', userId, 'gold_price_history');
  }

  private static docId(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  /** Every monthly point stored for this user, oldest first. */
  async getStoredPoints(userId: string): Promise<MonthlyPricePoint[]> {
    const snap = await getDocs(this.historyCol(userId));
    return snap.docs
      .map(d => d.data() as GoldPriceSnapshot)
      .filter(d => typeof d?.price === 'number' && d.price > 0)
      .map(d => ({ month: d.month, year: d.year, price: d.price }))
      .sort((a, b) => (a.year - b.year) || (a.month - b.month));
  }

  async savePoint(userId: string, year: number, month: number, price: number): Promise<void> {
    const snapshot: GoldPriceSnapshot = {
      price,
      fetchedAt: new Date().toISOString(),
      month,
      year
    };
    const ref = doc(this.firestore, 'users', userId, 'gold_price_history', GoldPriceHistoryService.docId(year, month));
    await setDoc(ref, snapshot, { merge: true });
  }

  /**
   * The last 12 monthly points, backfilling from the API only the months
   * Firestore doesn't already have.
   *
   * This is the whole point of persisting to Firestore: a cold browser costs
   * zero API requests, because the backfill happened once for the account. Only
   * the current month is re-read each time (its price is still moving), and
   * that one is served by the 23h spot cache.
   */
  async getLast12Months(userId: string): Promise<MonthlyPricePoint[]> {
    const stored = await this.getStoredPoints(userId);
    const byKey = new Map(stored.map(p => [GoldPriceHistoryService.docId(p.year, p.month), p]));

    const wanted = this.lastMonthKeys(MONTHS);
    const currentKey = wanted[wanted.length - 1].key;

    for (const { key, year, month } of wanted) {
      const isCurrent = key === currentKey;
      if (byKey.has(key) && !isCurrent) continue; // already cached — no request

      const price = await this.goldPriceService.getMonthPrice(year, month);
      // Stop on the first failure instead of retrying the rest: if the endpoint
      // is rejecting us, burning the remaining quota gains nothing.
      if (price === null) break;

      const existing = byKey.get(key);
      byKey.set(key, { year, month, price });
      if (!existing || existing.price !== price) {
        try {
          await this.savePoint(userId, year, month, price);
        } catch (error) {
          console.error('[GoldPriceHistory] no se pudo guardar', key, error);
        }
      }
    }

    return wanted
      .map(w => byKey.get(w.key))
      .filter((p): p is MonthlyPricePoint => !!p);
  }

  private lastMonthKeys(months: number): { key: string; year: number; month: number }[] {
    const now = new Date();
    const out: { key: string; year: number; month: number }[] = [];
    for (let back = months - 1; back >= 0; back--) {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      out.push({ key: GoldPriceHistoryService.docId(year, month), year, month });
    }
    return out;
  }
}
