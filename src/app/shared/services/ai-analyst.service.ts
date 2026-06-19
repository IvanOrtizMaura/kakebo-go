import { Injectable, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, QueryConstraint, collection, getDocs, query, orderBy, where } from '@angular/fire/firestore';
import { Ahorro, Deuda, DeudaSection, Factura, FondoAhorro, Gasto, Ingreso, InversionOro, Month } from '../models';
import { environment } from '../../../environments/environment';
import { UserProfileService } from '../../core/auth/user-profile.service';
import { AportacionPension } from './pensiones.service';
import { MONTH_NAMES } from '../constants/months';
import { formatEuros } from '../utils/currency';

const CHAT_FUNCTION_URL = environment.production
  ? '/api/chat'
  : `http://localhost:5001/${environment.firebase.projectId}/europe-west1/chat`;

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

    if (totalIngresos === 0 && totalFacturas === 0 && totalGastos === 0) return null;

    const lines: string[] = [`=== ${data.label} ===`];

    if (data.ingresos.length > 0) {
      lines.push(`Ingresos: ${formatEuros(totalIngresos)}`);
      data.ingresos.forEach(ingreso => lines.push(`  - ${ingreso.fuente}: ${formatEuros(ingreso.real)}`));
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

      const idToken = await this.auth.currentUser?.getIdToken();
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
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData?.error ?? `Error ${response.status}`);
      }

      const data = await response.json() as { content?: string };
      const assistantMessage = data.content ?? 'No se pudo obtener respuesta.';

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
