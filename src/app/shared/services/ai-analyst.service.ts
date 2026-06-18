import { Injectable, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, getDocs, query, orderBy, where } from '@angular/fire/firestore';
import { Month } from '../models';
import { environment } from '../../../environments/environment';
import { UserProfileService } from '../../core/auth/user-profile.service';
import { Ahorro, Deuda, DeudaSection, Factura, FondoAhorro, Gasto, Ingreso, InversionOro } from '../models';
import { AportacionPension } from './pensiones.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface MonthData {
  label: string;
  ingresos: Ingreso[];
  facturas: Factura[];
  gastos: Gasto[];
  ahorros: Ahorro[];
  deudas: DeudaSection[];
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

@Injectable({ providedIn: 'root' })
export class AiAnalystService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly userProfileService = inject(UserProfileService);

  readonly messages = signal<ChatMessage[]>([]);
  readonly isLoading = signal(false);
  readonly isLoadingContext = signal(false);

  private cachedContext: string | null = null;
  private cachedContextYear: number | null = null;

  private generateMonthIds(year: number): string[] {
    const now = new Date();
    const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    return Array.from({ length: maxMonth }, (_, i) => {
      const month = i + 1;
      return `${year}-${String(month).padStart(2, '0')}`;
    });
  }

  private formatEuros(amount: number): string {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
    }).format(amount);
  }

  private buildMonthSection(data: MonthData): string | null {
    const totalIngresos = data.ingresos.reduce((sum, i) => sum + (i.real || 0), 0);
    const totalFacturas = data.facturas.reduce((sum, f) => sum + (f.real || 0), 0);
    const totalGastos = data.gastos.reduce((sum, g) => sum + (g.real || 0), 0);
    const totalAhorros = data.ahorros.reduce((sum, a) => sum + (a.real || 0), 0);
    const totalDeudas = data.deudas.reduce((sum, d) => sum + (d.real || 0), 0);

    if (totalIngresos === 0 && totalFacturas === 0 && totalGastos === 0) return null;

    const lines: string[] = [`=== ${data.label} ===`];

    if (data.ingresos.length > 0) {
      lines.push(`Ingresos: ${this.formatEuros(totalIngresos)}`);
      data.ingresos.forEach(i => lines.push(`  - ${i.fuente}: ${this.formatEuros(i.real)}`));
    }

    if (data.facturas.length > 0) {
      lines.push(`Facturas: ${this.formatEuros(totalFacturas)}`);
      data.facturas.forEach(f => {
        const flag = f.real > f.presupuestado ? ' [EXCEDE PRESUPUESTO]' : '';
        lines.push(`  - ${f.name}: presup. ${this.formatEuros(f.presupuestado)} | real: ${this.formatEuros(f.real)}${flag}`);
      });
    }

    if (data.gastos.length > 0) {
      lines.push(`Gastos: ${this.formatEuros(totalGastos)}`);
      data.gastos.forEach(g => {
        const flag = g.real > g.presupuestado ? ' [EXCEDE PRESUPUESTO]' : '';
        lines.push(`  - ${g.name} (${g.tipo}): presup. ${this.formatEuros(g.presupuestado)} | real: ${this.formatEuros(g.real)}${flag}`);
      });
    }

    if (data.ahorros.length > 0) {
      lines.push(`Ahorros: ${this.formatEuros(totalAhorros)}`);
      data.ahorros.forEach(a => lines.push(`  - ${a.name}: ${this.formatEuros(a.real)}`));
    }

    if (data.deudas.length > 0) {
      lines.push(`Deudas: ${this.formatEuros(totalDeudas)}`);
      data.deudas.forEach(d => lines.push(`  - ${d.name}: ${this.formatEuros(d.real)}`));
    }

    const balance = totalIngresos - totalFacturas - totalGastos - totalAhorros - totalDeudas;
    lines.push(`Balance disponible: ${this.formatEuros(balance)}`);

    return lines.join('\n');
  }

  async buildFinancialContext(year: number): Promise<string> {
    if (this.cachedContext && this.cachedContextYear === year) {
      return this.cachedContext;
    }

    this.isLoadingContext.set(true);

    try {
      const uid = this.auth.currentUser?.uid;
      if (!uid) throw new Error('Usuario no autenticado');

      // Step 1: fetch month documents for the year (they have auto-generated Firestore IDs)
      const monthsCol = collection(this.firestore, 'users', uid, 'months');
      const monthsSnap = await getDocs(
        query(monthsCol, where('year', '==', year)),
      );

      const fetchCol = async <T>(firestoreMonthId: string, sub: string): Promise<T[]> => {
        const ref = collection(this.firestore, 'users', uid, 'months', firestoreMonthId, sub);
        const snap = await getDocs(query(ref, orderBy('order_index')));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }) as T);
      };

      // Sort months by month number in JS to avoid needing a composite index
      const sortedMonthDocs = monthsSnap.docs.sort((a, b) => {
        const aMonth = (a.data() as Month).month ?? 0;
        const bMonth = (b.data() as Month).month ?? 0;
        return aMonth - bMonth;
      });

      // Step 2: for each month doc, fetch its subcollections using the real Firestore doc ID
      const monthsData = await Promise.all(
        sortedMonthDocs.map(async (monthDoc) => {
          const monthMeta = monthDoc.data() as Month;
          const firestoreMonthId = monthDoc.id;

          const [ingresos, facturas, gastos, ahorros, deudas] = await Promise.all([
            fetchCol<Ingreso>(firestoreMonthId, 'ingresos'),
            fetchCol<Factura>(firestoreMonthId, 'facturas'),
            fetchCol<Gasto>(firestoreMonthId, 'gastos'),
            fetchCol<Ahorro>(firestoreMonthId, 'ahorros'),
            fetchCol<DeudaSection>(firestoreMonthId, 'deudas'),
          ]);

          const monthIndex = (monthMeta.month || 1) - 1;
          return {
            label: `${MONTH_NAMES[monthIndex]} ${year}`,
            ingresos,
            facturas,
            gastos,
            ahorros,
            deudas,
          };
        }),
      );

      const monthlySections = monthsData
        .map(data => this.buildMonthSection(data))
        .filter(Boolean)
        .join('\n\n');

      // ── Fetch user-level (non-monthly) data in parallel ───────────────────
      const fetchUserCol = async <T>(sub: string, constraints: Parameters<typeof query>[1][] = []): Promise<T[]> => {
        const ref = collection(this.firestore, 'users', uid, sub);
        const snap = await getDocs(constraints.length ? query(ref, ...constraints) : ref);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }) as T);
      };

      const [inversiones, deudasMaestras, fondosAhorro, pensiones] = await Promise.all([
        fetchUserCol<InversionOro>('inversiones'),
        fetchUserCol<Deuda>('deudas', [where('is_active', '==', true)]),
        fetchUserCol<FondoAhorro>('fondos_ahorro', [where('is_active', '==', true)]),
        fetchUserCol<AportacionPension>('pensiones_aportaciones'),
      ]);

      // ── Build general data section ─────────────────────────────────────────
      const generalLines: string[] = ['DATOS GENERALES (patrimonio y compromisos):'];

      if (inversiones.length > 0) {
        const totalInvertido = inversiones.reduce((s, i) => s + (i.precio_compra || 0), 0);
        const totalGramos = inversiones.reduce((s, i) => s + (i.gramos || 0), 0);
        generalLines.push(`\nInversiones en oro (${inversiones.length} posiciones | ${totalGramos.toFixed(1)}g | comprado por ${this.formatEuros(totalInvertido)}):`);
        inversiones.forEach(i => {
          const quilates = i.pureza >= 1 ? `${i.pureza / 10}k` : `${(i.pureza * 1000).toFixed(0)}‰`;
          generalLines.push(`  - ${i.name}: ${i.gramos}g | pureza ${quilates} | precio compra ${this.formatEuros(i.precio_compra)}`);
        });
      }

      if (deudasMaestras.length > 0) {
        const totalRestante = deudasMaestras.reduce((s, d) => s + (d.amount_remaining || 0), 0);
        generalLines.push(`\nDeudas activas (${deudasMaestras.length} | restante total: ${this.formatEuros(totalRestante)}):`);
        deudasMaestras.forEach(d => {
          generalLines.push(`  - ${d.name}: total ${this.formatEuros(d.total_amount)} | pago mensual ${this.formatEuros(d.monthly_payment)} | restante ${this.formatEuros(d.amount_remaining)} | interés ${d.interest_rate}%`);
        });
      }

      if (fondosAhorro.length > 0) {
        const totalObjetivo = fondosAhorro.reduce((s, f) => s + (f.total_amount || 0), 0);
        generalLines.push(`\nFondos de ahorro activos (${fondosAhorro.length} | objetivo total: ${this.formatEuros(totalObjetivo)}):`);
        fondosAhorro.forEach(f => {
          generalLines.push(`  - ${f.name}: objetivo ${this.formatEuros(f.total_amount)} | aportación mensual ${this.formatEuros(f.monthly_amount)} | ${f.num_months} meses`);
        });
      }

      if (pensiones.length > 0) {
        const totalPension = pensiones.reduce((s, p) => s + (p.importe || 0), 0);
        generalLines.push(`\nAportaciones a pensión (${pensiones.length} aportaciones | total acumulado: ${this.formatEuros(totalPension)}):`);
        const lastFive = pensiones.slice(0, 5);
        lastFive.forEach(p => {
          const fecha = p.fecha instanceof Date ? p.fecha.toLocaleDateString('es-ES') : String(p.fecha).split('T')[0];
          const nota = p.nota ? ` | ${p.nota}` : '';
          generalLines.push(`  - ${fecha}: ${this.formatEuros(p.importe)}${nota}`);
        });
        if (pensiones.length > 5) generalLines.push(`  ... y ${pensiones.length - 5} más`);
      }

      const generalSection = generalLines.length > 1 ? generalLines.join('\n') : '';

      // ── Build profile context ──────────────────────────────────────────────
      let profileContext = '';
      const profile = await this.userProfileService.getProfile(uid);
      if (profile) {
        profileContext = [
          '\nPERFIL DEL USUARIO:',
          `- Ingreso neto mensual esperado: ${this.formatEuros(profile.monthly_net_income)}`,
          `- Objetivo de ahorro: ${profile.savings_percentage}%`,
          `- Tiene deuda de alto interés: ${profile.has_high_interest_debt ? 'Sí' : 'No'}`,
          `- Tiene pareja: ${profile.has_partner ? 'Sí' : 'No'}`,
          '',
        ].join('\n');
      }

      this.cachedContext = [
        'Eres un asesor financiero personal experto en el método Kakebo japonés de control de gastos.',
        'Tienes acceso completo a las finanzas del usuario: ingresos, gastos, facturas, ahorros, deudas, inversiones, fondos de ahorro y pensiones.',
        profileContext,
        generalSection,
        `\nDATOS MENSUALES AÑO ${year}:`,
        monthlySections || 'No hay datos mensuales registrados para este año todavía.',
        '',
        'INSTRUCCIONES:',
        '- Responde siempre en español, de forma conversacional y directa.',
        '- Los "gastos hormiga" son pequeños gastos variables que se repiten y acumulan (cafés, snacks, suscripciones menores, compras impulsivas). Cuando el usuario pregunte, identifícalos en los gastos variables y calcula su total.',
        '- Señala con ⚠️ las partidas donde el gasto real supera al presupuestado.',
        '- Para preguntas sobre inversiones, deudas, fondos de ahorro o pensiones, usa los datos de la sección DATOS GENERALES.',
        '- Da consejos prácticos y accionables, no solo observaciones.',
      ].join('\n');

      this.cachedContextYear = year;
      return this.cachedContext;
    } finally {
      this.isLoadingContext.set(false);
    }
  }

  async sendMessage(userMessage: string, year: number): Promise<void> {
    if (this.isLoading()) return;

    this.messages.update(msgs => [
      ...msgs,
      { role: 'user', content: userMessage, timestamp: new Date() },
    ]);

    this.isLoading.set(true);

    try {
      const systemPrompt = await this.buildFinancialContext(year);

      const history: OpenAIMessage[] = this.messages().map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${environment.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }, ...history],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(errorData?.error?.message ?? `Error ${response.status}`);
      }

      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const assistantMessage = data.choices?.[0]?.message?.content ?? 'No se pudo obtener respuesta.';

      this.messages.update(msgs => [
        ...msgs,
        { role: 'assistant', content: assistantMessage, timestamp: new Date() },
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.messages.update(msgs => [
        ...msgs,
        {
          role: 'assistant',
          content: `Ha ocurrido un error al conectar con la IA: ${message}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      this.isLoading.set(false);
    }
  }

  clearConversation(): void {
    this.messages.set([]);
    this.cachedContext = null;
    this.cachedContextYear = null;
  }
}
