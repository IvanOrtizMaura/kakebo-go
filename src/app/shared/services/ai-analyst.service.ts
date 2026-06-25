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
  private cachedContextYear: number | null = null;

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

  async buildFinancialContext(year: number): Promise<string> {
    if (this.cachedContext && this.cachedContextYear === year) {
      return this.cachedContext;
    }

    this.isLoadingContext.set(true);

    try {
      const uid = this.auth.currentUser?.uid;
      if (!uid) throw new Error('Usuario no autenticado');

      const monthsCol = collection(this.firestore, 'users', uid, 'months');
      const monthsSnap = await getDocs(
        query(monthsCol, where('year', '==', year)),
      );

      const fetchCol = async <T>(firestoreMonthId: string, subcollection: string): Promise<T[]> => {
        const ref = collection(this.firestore, 'users', uid, 'months', firestoreMonthId, subcollection);
        const snap = await getDocs(query(ref, orderBy('order_index')));
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as T);
      };

      const sortedMonthDocs = monthsSnap.docs.sort((a, b) => {
        const aMonth = (a.data() as Month).month ?? 0;
        const bMonth = (b.data() as Month).month ?? 0;
        return aMonth - bMonth;
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
        `Eres un asistente financiero ultra-conciso. Hoy es ${todayStr}.`,
        profileContext,
        generalSection,
        `\nDATOS MENSUALES AÑO ${year}:`,
        monthlySections || 'Sin datos para este año.',
        '',
        'ESTILO DE RESPUESTA — sigue esto siempre:',
        '• Responde como un amigo que sabe de finanzas, no como un informe.',
        '• Una sola frase cuando sea posible. Ejemplo: "Te quedan 340€ para gastar este mes."',
        '• Si hay lista, máximo 4 ítems. Sin explicaciones extra.',
        '• Nunca empieces con "¡Claro!", "Por supuesto", "Entendido" ni similares.',
        '• Usa **negrita** para cifras importantes.',
        '• ⚠️ solo cuando el gasto supera el presupuesto.',
        '• Sin datos → una frase corta diciendo qué falta.',
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
    this.cachedContextYear = null;
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
