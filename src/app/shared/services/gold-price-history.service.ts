import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  orderBy
} from '@angular/fire/firestore';
import { GoldPriceSnapshot } from '../models';

interface MonthlyPricePoint {
  month: number;
  year: number;
  price: number;
}

@Injectable({ providedIn: 'root' })
export class GoldPriceHistoryService {
  private readonly firestore = inject(Firestore);

  private historyCol(userId: string) {
    return collection(this.firestore, 'users', userId, 'gold_price_history');
  }

  async savePriceSnapshot(userId: string, price: number): Promise<void> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const dateStr = `${year}-${String(month).padStart(2, '0')}`;
    const snapshot: GoldPriceSnapshot = {
      price,
      fetchedAt: now.toISOString(),
      month,
      year
    };
    const ref = doc(this.firestore, 'users', userId, 'gold_price_history', dateStr);
    await setDoc(ref, snapshot, { merge: true });
  }

  async getLast12Months(userId: string): Promise<MonthlyPricePoint[]> {
    const orderedQuery = query(this.historyCol(userId), orderBy('year', 'asc'), orderBy('month', 'asc'));
    const snap = await getDocs(orderedQuery);
    const allPoints: MonthlyPricePoint[] = snap.docs.map(document => {
      const data = document.data() as GoldPriceSnapshot;
      return { month: data.month, year: data.year, price: data.price };
    });
    return allPoints.slice(-12);
  }
}
