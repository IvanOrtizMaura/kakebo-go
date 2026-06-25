import { Injectable, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, QueryConstraint, collection, getDocs, query, orderBy, where } from '@angular/fire/firestore';
import { Ahorro, Deuda, DeudaSection, Factura, FondoAhorro, Gasto, Ingreso, InversionOro, Month } from '../models';
import { environment } from '../../../environments/environment';
import { UserProfileService } from '../../core/auth/user-profile.service';
import { AportacionPension } from './pensiones.service';
import { MONTH_NAMES } from '../constants/months';
import { formatEuros } from '../utils/currency';

// In production always use the Firebase Function proxy.
// In dev, use the function emulator only if no openaiApiKey is set locally.
const CHAT_FUNCTION_URL = environment.production
  ? '/api/chat'
  : `http://localhost:5001/${environment.firebase.projectId}/europe-west1/chat`;

const devOpenAIKey = (environment as { openaiApiKey?: string }).openaiApiKey ?? '';
const isDevDirectOpenAI = !environment.production && !!devOpenAIKey;

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

@Injectable({ providedIn: 'root' })
export class AiAnalystService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly userProfileService = inject(UserProfileService);

  readonly messages = signal<ChatMessage[]>([]);
  readonly isLoading = signal(false);
  readonly isLoadingContext = signal(false);

  private cachedContext: string | null = null;

  private sumReal<T extends { real?: number }>(items: T[]): number {
    return items.reduce((sum, item) => sum + (item.real || 0), 0);
  }

  private overBudgetFlag(item: { real: number; presupuestado: number }): string {
    return item.real > item.presupuestado ? ' [EXCEDE PRESUPUESTO]' : '';
  }

  private buildMonthSection(data: MonthData): string | null {
    const totalIngresos = this.sumReal(data.ingresos);
    const totalFacturas = this.sumReal(data.facturas);
    const totalGastos = this.sumReal(data.gastos);
    const totalAhorros = this.sumReal(data.ahorros);
    const totalDeudas = this.sumReal(data.deudas);

    const totalEsperado = data.ingresos.reduce((sum, ingreso) => sum + (ingreso.esperado || 0), 0);

    if (totalIngresos === 0 && totalEsperado === 0 && totalFacturas === 0 && totalGastos === 0) return null;

    const lines: string[] = [`=== ${data.label} ===`];

    if (data.ingresos.length > 0) {
      lines.push(`Ingresos (cobrado ${formatEuros(totalIngresos)} / previsto ${formatEuros(totalEsperado)}):`);
      data.ingresos.forEach(ingreso => {
        const estado = ingreso.depositado ? 'cobrado' : 'pendiente';
        lines.push(`  - ${ingreso.fuente}: previsto ${formatEuros(ingreso.esperado)} | real ${formatEuros(ingreso.real)} (${estado})`);
      });
    }

    if (data.facturas.length > 0) {
      lines.push(`Facturas: ${formatEuros(totalFacturas)}`);
      data.facturas.forEach(factura => {
        lines.push(`  - ${factura.name}: presup. ${formatEuros(factura.presupuestado)} | real: ${formatEuros(factura.real)}${this.overBudgetFlag(factura)}`);
      });
    }

    if (data.gastos.length > 0) {
      lines.push(`Gastos: ${formatEuros(totalGastos)}`);
      data.gastos.forEach(gasto => {
        lines.push(`  - ${gasto.name} (${gasto.tipo}): presup. ${formatEuros(gasto.presupuestado)} | real: ${formatEuros(gasto.real)}${this.overBudgetFlag(gasto)}`);
      });
    }

    if (data.ahorros.length > 0) {
      lines.push(`Ahorros: ${formatEuros(totalAhorros)}`);
      data.ahorros.forEach(ahorro => lines.push(`  - ${ahorro.name}: ${formatEuros(ahorro.real)}`));
    }

    if (data.deudas.length > 0) {
      lines.push(`Deudas: ${formatEuros(totalDeudas)}`);
      data.deudas.forEach(deuda => lines.push(`  - ${deuda.name}: ${formatEuros(deuda.real)}`));
    }

    const balance = totalIngresos - totalFacturas - totalGastos - totalAhorros - totalDeudas;
    lines.push(`Balance disponible: ${formatEuros(balance)}`);

    return lines.join('\n');
  }

  async buildFinancialContext(): Promise<string> {
    if (this.cachedContext) return this.cachedContext;

    this.isLoadingContext.set(true);

    try {
      const uid = this.auth.currentUser?.uid;
      if (!uid) throw new Error('Usuario no autenticado');

      // Fetch ALL months across all years
      const monthsCol = collection(this.firestore, 'users', uid, 'months');
      const monthsSnap = await getDocs(monthsCol);

      const fetchCol = async <T>(firestoreMonthId: string, subcollection: string): Promise<T[]> => {
        const ref = collection(this.firestore, 'users', uid, 'months', firestoreMonthId, subcollection);
        const snap = await getDocs(query(ref, orderBy('order_index')));
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as T);
      };

      // Sort all months by year then month
      const sortedMonthDocs = monthsSnap.docs.sort((a, b) => {
        const aData = a.data() as Month;
        const bData = b.data() as Month;
        return aData.year !== bData.year
          ? (aData.year ?? 0) - (bData.year ?? 0)
          : (aData.month ?? 0) - (bData.month ?? 0);
      });

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
            label: `${MONTH_NAMES[monthIndex]} ${monthMeta.year}`,
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

      const fetchUserCol = async <T>(subcollection: string, constraints: QueryConstraint[] = []): Promise<T[]> => {
        const ref = collection(this.firestore, 'users', uid, subcollection);
        const snap = await getDocs(constraints.length ? query(ref, ...constraints) : ref);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as T);
      };

      const [inversiones, deudasMaestras, fondosAhorro, pensiones] = await Promise.all([
        fetchUserCol<InversionOro>('inversiones'),
        fetchUserCol<Deuda>('deudas', [where('is_active', '==', true)]),
        fetchUserCol<FondoAhorro>('fondos_ahorro', [where('is_active', '==', true)]),
        fetchUserCol<AportacionPension>('pensiones_aportaciones'),
      ]);

      const generalLines: string[] = ['DATOS GENERALES (patrimonio y compromisos):'];

      if (inversiones.length > 0) {
        const totalInvertido = inversiones.reduce((sum, inversion) => sum + (inversion.precio_compra || 0), 0);
        const totalGramos = inversiones.reduce((sum, inversion) => sum + (inversion.gramos || 0), 0);
        generalLines.push(`\nInversiones en oro (${inversiones.length} posiciones | ${totalGramos.toFixed(1)}g | comprado por ${formatEuros(totalInvertido)}):`);
        inversiones.forEach(inversion => {
          const quilates = inversion.pureza >= 1 ? `${inversion.pureza / 10}k` : `${(inversion.pureza * 1000).toFixed(0)}‰`;
          generalLines.push(`  - ${inversion.name}: ${inversion.gramos}g | pureza ${quilates} | precio compra ${formatEuros(inversion.precio_compra)}`);
        });
      }

      if (deudasMaestras.length > 0) {
        const totalRestante = deudasMaestras.reduce((sum, deuda) => sum + (deuda.amount_remaining || 0), 0);
        generalLines.push(`\nDeudas activas (${deudasMaestras.length} | restante total: ${formatEuros(totalRestante)}):`);
        deudasMaestras.forEach(deuda => {
          generalLines.push(`  - ${deuda.name}: total ${formatEuros(deuda.total_amount)} | pago mensual ${formatEuros(deuda.monthly_payment)} | restante ${formatEuros(deuda.amount_remaining)} | interés ${deuda.interest_rate}%`);
        });
      }

      if (fondosAhorro.length > 0) {
        const totalObjetivo = fondosAhorro.reduce((sum, fondo) => sum + (fondo.total_amount || 0), 0);
        generalLines.push(`\nFondos de ahorro activos (${fondosAhorro.length} | objetivo total: ${formatEuros(totalObjetivo)}):`);
        fondosAhorro.forEach(fondo => {
          generalLines.push(`  - ${fondo.name}: objetivo ${formatEuros(fondo.total_amount)} | aportación mensual ${formatEuros(fondo.monthly_amount)} | ${fondo.num_months} meses`);
        });
      }

      if (pensiones.length > 0) {
        const totalPension = pensiones.reduce((sum, pension) => sum + (pension.importe || 0), 0);
        generalLines.push(`\nAportaciones a pensión (${pensiones.length} aportaciones | total acumulado: ${formatEuros(totalPension)}):`);
        const lastFive = pensiones.slice(0, 5);
        lastFive.forEach(pension => {
          const fecha = pension.fecha instanceof Date ? pension.fecha.toLocaleDateString('es-ES') : String(pension.fecha).split('T')[0];
          const nota = pension.nota ? ` | ${pension.nota}` : '';
          generalLines.push(`  - ${fecha}: ${formatEuros(pension.importe)}${nota}`);
        });
        if (pensiones.length > 5) generalLines.push(`  ... y ${pensiones.length - 5} más`);
      }

      const generalSection = generalLines.length > 1 ? generalLines.join('\n') : '';

      let profileContext = '';
      const profile = await this.userProfileService.getProfile(uid);
      if (profile) {
        profileContext = [
          '\nPERFIL DEL USUARIO:',
          `- Ingreso neto mensual esperado: ${formatEuros(profile.monthly_net_income)}`,
          `- Objetivo de ahorro: ${profile.savings_percentage}%`,
          `- Tiene deuda de alto interés: ${profile.has_high_interest_debt ? 'Sí' : 'No'}`,
          `- Tiene pareja: ${profile.has_partner ? 'Sí' : 'No'}`,
          '',
        ].join('\n');
      }

      const todayStr = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

      this.cachedContext = [
        `Eres un asesor financiero personal experto. Hoy es ${todayStr}.`,
        profileContext,
        generalSection,
        '\nHISTÓRICO MENSUAL (todos los años disponibles):',
        monthlySections || 'Sin datos registrados todavía.',
        '',
        'BENCHMARKS ECONÓMICOS (usa estos para comparar y dar consejos):',
        '• Regla 50/30/20: 50% necesidades (vivienda, alimentación, transporte), 30% deseos (ocio, ropa), 20% ahorro/inversión.',
        '• Tasa de ahorro media española: ~7-8% del ingreso neto (fuente: Banco de España). El objetivo recomendado es ≥ 20%.',
        '• Fondo de emergencia: 3-6 meses de gastos esenciales en liquidez.',
        '• Ratio deuda/ingresos sano: pagos de deuda < 30% del ingreso neto mensual.',
        '• Inflación media España 2024-2025: ~2-3%. El dinero sin invertir pierde poder adquisitivo.',
        '• Inversión indexada a largo plazo (S&P500 histórico): +10% anual nominal, +7% real.',
        '• Gastos hormiga típicos en España: 150-300€/mes (cafés, suscripciones, compras impulsivas).',
        '• Pensión pública media España 2025: ~1.400€/mes. Complementar con ahorro privado es crítico.',
        '',
        'ESTILO DE RESPUESTA:',
        '• Responde como un amigo experto en finanzas: directo, sin relleno.',
        '• Cuando el usuario pida analizar un año o mes, compara sus datos con los benchmarks anteriores.',
        '• Indica claramente si está bien, por encima o por debajo de la media. Usa ✅ (bien), ⚠️ (mejorable), ❌ (problema).',
        '• Una frase por punto. Si hay lista, máximo 4 ítems.',
        '• **Negrita** para cifras importantes.',
        '• Nunca empieces con "¡Claro!", "Por supuesto", "Entendido".',
      ].join('\n');
      return this.cachedContext;
    } finally {
      this.isLoadingContext.set(false);
    }
  }

  async sendMessage(userMessage: string): Promise<void> {
    if (this.isLoading()) return;

    this.messages.update(msgs => [
      ...msgs,
      { role: 'user', content: userMessage, timestamp: new Date() },
    ]);

    this.isLoading.set(true);

    try {
      const systemPrompt = await this.buildFinancialContext();

      const history: OpenAIMessage[] = this.messages().map(m => ({
        role: m.role,
        content: m.content,
      }));

      let assistantContent: string;

      if (isDevDirectOpenAI) {
        // Local dev with openaiApiKey in environment.ts → call OpenAI directly
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${devOpenAIKey}`,
          },
          // Keep in sync with functions/src/index.ts
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }, ...history],
            temperature: 0.3,
            max_tokens: 400,
          }),
        });

        if (!response.ok) {
          throw new Error(await this.parseRequestError(response, true));
        }

        const openaiJson = await response.json();
        assistantContent = this.extractOpenAIContent(openaiJson);
      } else {
        // Production or local emulator → use Firebase Function proxy
        let idToken = await this.auth.currentUser?.getIdToken();
        if (!idToken) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          idToken = await this.auth.currentUser?.getIdToken();
        }
        if (!idToken) throw new Error('No autenticado');

        const response = await fetch(CHAT_FUNCTION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken,
            messages: [{ role: 'system', content: systemPrompt }, ...history],
          }),
        });

        if (!response.ok) {
          throw new Error(await this.parseRequestError(response, false));
        }

        const proxyJson = await response.json() as { content?: string };
        assistantContent = proxyJson.content ?? 'No se pudo obtener respuesta.';
      }

      this.messages.update(msgs => [
        ...msgs,
        { role: 'assistant', content: assistantContent, timestamp: new Date() },
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
  }

  private async parseRequestError(response: Response, isOpenAI: boolean): Promise<string> {
    const body = await response.json().catch(() => ({}));
    if (isOpenAI) {
      return (body as { error?: { message?: string } })?.error?.message ?? `Error ${response.status}`;
    }
    return (body as { error?: string })?.error ?? `Error ${response.status}`;
  }

  private extractOpenAIContent(json: unknown): string {
    return (json as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ?? 'No se pudo obtener respuesta.';
  }
}
