import * as admin from 'firebase-admin';
import { Telegraf } from 'telegraf';
import OpenAI from 'openai';
import { tavily } from '@tavily/core';
import cron from 'node-cron';

// ── Firebase Admin ────────────────────────────────────────────────────────────
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (serviceAccountJson) {
  const serviceAccount = JSON.parse(serviceAccountJson);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} else {
  admin.initializeApp();
}
const db = admin.firestore();

// ── Env vars ──────────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? '';
const ALLOWED_CHAT_ID = parseInt(process.env.TELEGRAM_ALLOWED_CHAT_ID ?? '0', 10);

if (!BOT_TOKEN) { console.error('TELEGRAM_BOT_TOKEN missing'); process.exit(1); }
if (!OPENAI_API_KEY) { console.error('OPENAI_API_KEY missing'); process.exit(1); }
if (!ALLOWED_CHAT_ID) { console.error('TELEGRAM_ALLOWED_CHAT_ID missing'); process.exit(1); }

// ── OpenAI ────────────────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ── Tavily web search ─────────────────────────────────────────────────────────
const tavilyClient = TAVILY_API_KEY ? tavily({ apiKey: TAVILY_API_KEY }) : null;

async function webSearch(query: string): Promise<string> {
  if (!tavilyClient) return 'Web search not configured.';
  try {
    console.log('[search]', query);
    const result = await tavilyClient.search(query, {
      searchDepth: 'basic',
      maxResults: 4,
      includeAnswer: true,
    });
    const answer = result.answer ? `Respuesta directa: ${result.answer}\n\n` : '';
    const sources = result.results.map(r => `• ${r.title}: ${r.content?.slice(0, 300)}`).join('\n');
    return `${answer}Fuentes:\n${sources}`;
  } catch (e) {
    console.error('[search] error:', e);
    return 'Error al buscar en web.';
  }
}

// ── OpenAI tool definitions ───────────────────────────────────────────────────
const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information: laws, subsidies, mortgage rates, housing aid, tax regulations, etc. Use when the user asks about something that may have changed recently or requires up-to-date information.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query in Spanish, specific and focused. E.g. "ayudas hipoteca jóvenes menores 35 años Baleares 2025"',
          },
        },
        required: ['query'],
      },
    },
  },
];

// ── Session management ────────────────────────────────────────────────────────
interface Session {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  lastActivity: number;
}

const sessions = new Map<number, Session>();
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_HISTORY = 20;

// Two independent session stores — finance and planning never mix
const financeSessions = new Map<number, Session>();
const planningSessions = new Map<number, Session>();

function getOrCreateSession(chatId: number, store: Map<number, Session>): Session {
  const existing = store.get(chatId);
  if (existing && Date.now() - existing.lastActivity < SESSION_TTL_MS) return existing;
  const session: Session = { messages: [], lastActivity: Date.now() };
  store.set(chatId, session);
  return session;
}

function trimHistory(session: Session): void {
  if (session.messages.length > MAX_HISTORY) {
    session.messages = session.messages.slice(-MAX_HISTORY);
  }
}

// ── Firestore data types ──────────────────────────────────────────────────────
interface InversionOroDoc { gramos?: number; pureza?: number; precio_compra?: number; formato?: string; pieza?: string; name?: string; spotPrecioCompra?: number; }
interface FondoAhorroDoc { name?: string; total_amount?: number; monthly_amount?: number; is_active?: boolean; }
interface DeudaDoc { name?: string; type?: string; total_amount?: number; amount_remaining?: number; monthly_payment?: number; is_active?: boolean; }
interface AportacionDoc { importe?: number; fecha?: unknown; nota?: string; }

// ── Financial context builder ─────────────────────────────────────────────────
async function buildFinancialContext(uid: string): Promise<{ financePrompt: string; planningPrompt: string }> {
  const now = new Date();
  const year = now.getFullYear();
  const userRef = db.collection('users').doc(uid);

  console.log('[ctx] uid:', uid, 'year:', year);

  const [monthsSnap, inversionesSnap, fondosSnap, deudasSnap, pensionesSnap] = await Promise.all([
    userRef.collection('months').where('year', '==', year).get(),
    userRef.collection('inversiones').get().catch(() => null),
    userRef.collection('fondos_ahorro').where('is_active', '==', true).get().catch(() => null),
    userRef.collection('deudas').where('is_active', '==', true).get().catch(() => null),
    userRef.collection('pensiones_aportaciones').get().catch(() => null),
  ]);

  console.log('[ctx] months:', monthsSnap.size, '| inversiones:', inversionesSnap?.size ?? 'err');

  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const sections: string[] = [];

  const sortedMonths = monthsSnap.docs.sort((a, b) => (a.data()['month'] ?? 0) - (b.data()['month'] ?? 0));
  const monthSubdata = await Promise.all(
    sortedMonths.map(monthDoc => {
      const base = userRef.collection('months').doc(monthDoc.id);
      return Promise.all([
        base.collection('ingresos').get().catch(() => null),
        base.collection('facturas').get().catch(() => null),
        base.collection('gastos').get().catch(() => null),
        base.collection('ahorros').get().catch(() => null),
      ]);
    })
  );

  for (let i = 0; i < sortedMonths.length; i++) {
    const monthData = sortedMonths[i].data();
    const monthLabel = `${monthNames[(monthData['month'] ?? 1) - 1]} ${year}`;
    const [ingresos, facturas, gastos, ahorros] = monthSubdata[i];

    const totalIngresos = ingresos?.docs.reduce((s, d) => s + (d.data()['real'] || 0), 0) ?? 0;
    const totalEsperado = ingresos?.docs.reduce((s, d) => s + (d.data()['esperado'] || 0), 0) ?? 0;
    const totalGastos = gastos?.docs.reduce((s, d) => s + (d.data()['real'] || 0), 0) ?? 0;
    const totalFacturas = facturas?.docs.reduce((s, d) => s + (d.data()['real'] || 0), 0) ?? 0;
    const totalAhorros = ahorros?.docs.reduce((s, d) => s + (d.data()['real'] || 0), 0) ?? 0;

    if (totalIngresos === 0 && totalEsperado === 0 && totalGastos === 0 && totalFacturas === 0) continue;

    const lines = [`=== ${monthLabel} ===`];
    if (totalIngresos > 0 || totalEsperado > 0) {
      lines.push(`Ingresos: cobrado ${totalIngresos}€ / previsto ${totalEsperado}€`);
      const byFuente = new Map<string, number>();
      ingresos?.docs.forEach(d => {
        const key = (d.data()['fuente'] ?? '').toLowerCase().trim();
        byFuente.set(key, (byFuente.get(key) ?? 0) + (d.data()['real'] || 0));
      });
      byFuente.forEach((v, k) => lines.push(`  - ${k}: ${v}€`));
    }
    if (totalFacturas > 0) lines.push(`Facturas: ${totalFacturas}€`);
    if (totalGastos > 0) lines.push(`Gastos: ${totalGastos}€`);
    if (totalAhorros > 0) lines.push(`Ahorros: ${totalAhorros}€`);
    lines.push(`Balance: ${totalIngresos - totalFacturas - totalGastos - totalAhorros}€`);
    sections.push(lines.join('\n'));
  }

  // Pre-calculate income average so the model uses the right figure
  const incomePerMonth = monthSubdata.map(([ing]) =>
    ing?.docs.reduce((s: number, d) => s + (d.data()['real'] || 0), 0) ?? 0
  );
  const monthsWithIncome = incomePerMonth.filter(v => v > 0);
  const totalAllIncome = monthsWithIncome.reduce((a, b) => a + b, 0);
  const avgMonthlyIncome = monthsWithIncome.length > 0
    ? (totalAllIncome / monthsWithIncome.length).toFixed(2)
    : '0';
  sections.unshift(`RESUMEN INGRESOS USUARIO:\nMedia mensual neta (${monthsWithIncome.length} meses con datos): ${avgMonthlyIncome}€/mes\nUSA SIEMPRE ESTA CIFRA como ingreso del usuario, no los meses individuales.`);

  if (inversionesSnap && !inversionesSnap.empty) {
    const invLines = ['INVERSIONES EN ORO:'];
    let totalGramos = 0; let totalInvertido = 0;
    inversionesSnap.docs.forEach(d => {
      const inv = d.data() as InversionOroDoc;
      const gramos = inv.gramos ?? 0; const precio = inv.precio_compra ?? 0;
      const pureza = inv.pureza ?? 999.9; const karat = Math.round(pureza / 41.666);
      const precioG = gramos > 0 ? (precio / gramos).toFixed(2) : '—';
      const pieza = inv.pieza ?? inv.name ?? 'Sin nombre';
      totalGramos += gramos; totalInvertido += precio;
      let line = `- ${pieza} (${inv.formato ?? 'Lingote'}, ${karat}k): ${gramos}g por ${precio}€ (${precioG}€/g)`;
      if (inv.spotPrecioCompra) line += ` — spot compra: ${(inv.spotPrecioCompra * (pureza / 999.9)).toFixed(2)}€/g`;
      invLines.push(line);
    });
    invLines.push(`Total: ${totalGramos.toFixed(2)}g invertidos ${totalInvertido.toFixed(2)}€`);
    sections.push(invLines.join('\n'));
  }

  if (fondosSnap && !fondosSnap.empty) {
    const fondoLines = ['FONDOS DE AHORRO (activos):'];
    fondosSnap.docs.forEach(d => {
      const f = d.data() as FondoAhorroDoc;
      fondoLines.push(`- ${f.name ?? '?'}: objetivo ${f.total_amount ?? 0}€, aportación ${f.monthly_amount ?? 0}€/mes`);
    });
    sections.push(fondoLines.join('\n'));
  }

  if (deudasSnap && !deudasSnap.empty) {
    const deudaLines = ['DEUDAS (activas):'];
    let totalPendiente = 0;
    deudasSnap.docs.forEach(d => {
      const deuda = d.data() as DeudaDoc;
      const pendiente = deuda.amount_remaining ?? 0; totalPendiente += pendiente;
      deudaLines.push(`- ${deuda.name ?? '?'}: pendiente ${pendiente}€, cuota ${deuda.monthly_payment ?? 0}€/mes`);
    });
    deudaLines.push(`Total pendiente: ${totalPendiente.toFixed(2)}€`);
    sections.push(deudaLines.join('\n'));
  }

  if (pensionesSnap && !pensionesSnap.empty) {
    const pensionLines = ['PENSIONES (aportaciones):'];
    let totalPensiones = 0;
    pensionesSnap.docs.forEach(d => {
      const ap = d.data() as AportacionDoc;
      const importe = ap.importe ?? 0; totalPensiones += importe;
      const fechaStr = ap.fecha ? new Date((ap.fecha as { seconds?: number }).seconds ? (ap.fecha as { seconds: number }).seconds * 1000 : String(ap.fecha)).toLocaleDateString('es-ES') : '?';
      pensionLines.push(`- ${fechaStr}: ${importe}€${ap.nota ? ` — ${ap.nota}` : ''}`);
    });
    pensionLines.push(`Total aportado: ${totalPensiones.toFixed(2)}€`);
    sections.push(pensionLines.join('\n'));
  }

  const todayStr = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const dataBlock = `FINANCIAL DATA YEAR ${year}:\n${sections.join('\n\n') || 'No data recorded yet.'}`;

  const financePrompt = `You are a personal finance assistant. Today is ${todayStr}. Always respond in Spanish.

Your ONLY job in this mode: answer questions about the user's real financial data below.
- Use the data as-is. Never ask for additional financial info — everything you need is in the data.
- Income average: use the pre-calculated average shown at the top of the data.
- Be direct and concise. Use **bold** for key figures. Max 10 lines per answer.
- Do NOT mention mortgages, down payments, or planning topics — those belong to /hipoteca mode.

${dataBlock}`;

  const planningPrompt = `You are a financial planning expert specializing in mortgages and real estate (Spanish market). Today is ${todayStr}. Always respond in Spanish.

The user's financial data is provided below for context (use their income average for calculations).

MORTGAGE RULES (Spain):
- Max payment: 30-35% of total household net income
- Banks finance up to 80% (need 20% + ~10% taxes/fees). Bank-owned properties may offer up to 100%.
- Max term: 30 years, max age at end ~75
- Reference interest rate: 3.5% unless stated otherwise
- Include existing debts in DTI calculation (max 35-40% combined)

BEHAVIOR:
- Ask ONE missing piece of info at a time (down payment, ages, interest rate)
- Do not calculate until you have all necessary data
- Use web_search for laws, subsidies, current rates, age-based benefits

FINAL ANSWER FORMAT:
**✅ SÍ** / **❌ NO** / **⚠️ DEPENDE**
• Key figure 1
• Key figure 2
[2-3 sentences conclusion]

WEB SEARCH: Use proactively for subsidies, tax rules, current rates, regional benefits.

${dataBlock}`;

  return { financePrompt, planningPrompt };
}

// ── Bot setup (Telegraf polling — identical to MemoManager) ──────────────────
const bot = new Telegraf(BOT_TOKEN);

bot.use(async (ctx, next) => {
  if (ctx.chat?.id !== ALLOWED_CHAT_ID) return;
  return next();
});

// Track which mode each user is in
const userMode = new Map<number, 'finance' | 'planning'>();

function getMode(chatId: number): 'finance' | 'planning' {
  return userMode.get(chatId) ?? 'finance';
}

bot.command('start', ctx =>
  ctx.reply(
    '👋 ¡Hola! Soy tu asesor financiero de KakeboGo.\n\n' +
    '💰 *Modo finanzas* (por defecto)\nConsulta tus datos reales: ingresos, gastos, balance, inversiones...\n\n' +
    '🏠 *Modo planificación* → /hipoteca\nAnálisis de hipotecas, ayudas, simulaciones. Usa búsqueda web.\n\n' +
    '/help para ver todos los comandos.',
    { parse_mode: 'Markdown' }
  )
);

bot.command('help', ctx => {
  const mode = getMode(ctx.chat.id);
  return ctx.reply(
    `📋 *Comandos disponibles*\n\n` +
    `/hipoteca — Modo hipoteca y planificación 🏠\n` +
    `/finanzas — Modo consulta de tus datos 💰\n` +
    `/reset — Reiniciar conversación del modo actual\n` +
    `/resetall — Reiniciar ambos modos\n\n` +
    `*Modo actual:* ${mode === 'finance' ? '💰 Finanzas' : '🏠 Planificación'}`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('finanzas', ctx => {
  userMode.set(ctx.chat.id, 'finance');
  return ctx.reply('💰 *Modo finanzas activado*\nPregúntame sobre tus ingresos, gastos, balance, inversiones o deudas.', { parse_mode: 'Markdown' });
});

bot.command('hipoteca', ctx => {
  userMode.set(ctx.chat.id, 'planning');
  return ctx.reply('🏠 *Modo planificación activado*\nPuedo analizar hipotecas, buscar ayudas y subvenciones, simular escenarios financieros.\n\n¿Qué quieres analizar?', { parse_mode: 'Markdown' });
});

bot.command('reset', ctx => {
  const mode = getMode(ctx.chat.id);
  if (mode === 'finance') financeSessions.delete(ctx.chat.id);
  else planningSessions.delete(ctx.chat.id);
  return ctx.reply(`🔄 Conversación de ${mode === 'finance' ? 'finanzas' : 'planificación'} reiniciada.`);
});

bot.command('resetall', ctx => {
  financeSessions.delete(ctx.chat.id);
  planningSessions.delete(ctx.chat.id);
  return ctx.reply('🔄 Todas las conversaciones reiniciadas.');
});

bot.command('goldcheck', async ctx => {
  await ctx.reply('🔍 Comprobando precio del oro...');
  await checkGoldBuyingOpportunity();
  await ctx.reply('✅ Comprobación completada. Si el precio estaba por debajo de la media recibirás una alerta.');
});

// ── Shared helper to find uid ─────────────────────────────────────────────────
async function findUid(chatId: number): Promise<string | undefined> {
  const snap = await db.collection('users').where('telegram_chat_id', '==', chatId).get();
  if (snap.size === 1) return snap.docs[0].id;
  if (snap.size > 1) {
    const withMonths = await Promise.all(
      snap.docs.map(async d => {
        const m = await db.collection('users').doc(d.id).collection('months').limit(1).get();
        return { id: d.id, hasMonths: !m.empty };
      })
    );
    return withMonths.find(u => u.hasMonths)?.id ?? snap.docs[0].id;
  }
  return undefined;
}

// ── Shared OpenAI call with tool loop ─────────────────────────────────────────
async function runCompletion(
  systemPrompt: string,
  session: Session,
  withTools: boolean
): Promise<string> {
  const allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...session.messages,
  ];
  let reply = '';
  for (let i = 0; i < 5; i++) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: allMessages,
      ...(withTools ? { tools: TOOLS } : {}),
      temperature: 0.3,
      max_tokens: 600,
    });
    const msg = completion.choices[0].message;
    allMessages.push(msg);
    if (withTools && msg.tool_calls?.length) {
      for (const call of msg.tool_calls) {
        if (call.function.name === 'web_search') {
          const args = JSON.parse(call.function.arguments) as { query: string };
          allMessages.push({ role: 'tool', tool_call_id: call.id, content: await webSearch(args.query) });
        }
      }
      continue;
    }
    reply = msg.content ?? '⚠️ Sin respuesta.';
    break;
  }
  return reply;
}

bot.on('text', async ctx => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  const mode = getMode(chatId);
  console.log(`[bot] [${mode}] from ${chatId}: ${text}`);

  void ctx.sendChatAction('typing');

  const uid = await findUid(chatId);
  if (!uid) { await ctx.reply('⚠️ No hay datos financieros asociados a tu cuenta.'); return; }

  const { financePrompt, planningPrompt } = await buildFinancialContext(uid);
  const isFinance = mode === 'finance';
  const session = getOrCreateSession(chatId, isFinance ? financeSessions : planningSessions);
  session.messages.push({ role: 'user', content: text });
  trimHistory(session);
  try {
    const reply = await runCompletion(isFinance ? financePrompt : planningPrompt, session, !isFinance);
    session.messages.push({ role: 'assistant', content: reply });
    session.lastActivity = Date.now();
    try { await ctx.reply(reply, { parse_mode: 'Markdown' }); } catch { await ctx.reply(reply); }
  } catch (e) {
    console.error(`[bot] ${mode} error:`, e);
    session.messages.pop();
    await ctx.reply('⚠️ Error al procesar tu pregunta. Inténtalo de nuevo.');
  }
});

// ── Gold price alert cron ─────────────────────────────────────────────────────

const GOLD_API_KEY = process.env.GOLD_API_KEY ?? '';
const GOLD_TARGET_GRAMS_PER_YEAR = 12;
const ALERT_THRESHOLD_PCT = 1.5; // notify when price is 1.5% below 30-day avg
const HISTORY_DAYS = 30;

async function fetchGoldPriceEurPerGram(): Promise<number | null> {
  if (!GOLD_API_KEY) return null;
  try {
    const res = await fetch('https://www.goldapi.io/api/XAU/EUR', {
      headers: { 'x-access-token': GOLD_API_KEY },
    });
    if (!res.ok) return null;
    const data = await res.json() as { price_gram_24k?: number };
    return data.price_gram_24k ?? null;
  } catch { return null; }
}

async function checkGoldBuyingOpportunity(): Promise<void> {
  console.log('[gold-alert] running daily check');

  const price = await fetchGoldPriceEurPerGram();
  if (!price) { console.log('[gold-alert] could not fetch price'); return; }

  const today = new Date().toISOString().split('T')[0];
  const uid = 'L4xwr4phoWb9C7PbYBr8OjbMgEA2';
  const histRef = db.collection('users').doc(uid).collection('gold_price_history');

  // Store today's price
  await histRef.doc(today).set({ price, date: today, fetchedAt: new Date().toISOString() }, { merge: true });

  // Read last 30 days of history
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_DAYS);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const histSnap = await histRef.orderBy('date', 'asc').startAt(cutoffStr).get();

  if (histSnap.size < 7) {
    console.log('[gold-alert] not enough history yet:', histSnap.size, 'days');
    return;
  }

  const prices = histSnap.docs.map(d => (d.data() as { price: number }).price);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const diffPct = ((avg - price) / avg) * 100;

  console.log(`[gold-alert] price: ${price.toFixed(2)}€/g | 30d avg: ${avg.toFixed(2)}€/g | diff: ${diffPct.toFixed(2)}%`);

  if (diffPct < ALERT_THRESHOLD_PCT) {
    console.log('[gold-alert] price not below threshold, no alert');
    return;
  }

  // Check we haven't already alerted this week
  const alertRef = db.collection('users').doc(uid).collection('gold_alerts').doc('last');
  const lastAlert = await alertRef.get();
  if (lastAlert.exists) {
    const lastDate = (lastAlert.data() as { date: string }).date;
    const daysSince = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000);
    if (daysSince < 5) {
      console.log('[gold-alert] already alerted', daysSince, 'days ago, skipping');
      return;
    }
  }

  // Send alert
  const costPerGram = price.toFixed(2);
  const monthlyGrams = (GOLD_TARGET_GRAMS_PER_YEAR / 12).toFixed(1);
  const monthlyCost = (price * GOLD_TARGET_GRAMS_PER_YEAR / 12).toFixed(2);

  const message =
    `🏅 *Alerta de compra de oro*\n\n` +
    `Precio hoy: **${costPerGram}€/g**\n` +
    `Media 30 días: **${avg.toFixed(2)}€/g**\n` +
    `Descuento respecto a la media: **-${diffPct.toFixed(1)}%** 📉\n\n` +
    `Para tu objetivo de 12g/año:\n` +
    `• Cuota mensual: ${monthlyGrams}g → **${monthlyCost}€**\n\n` +
    `_Buen momento para comprar — precio por debajo de la media reciente._`;

  try {
    await bot.telegram.sendMessage(ALLOWED_CHAT_ID, message, { parse_mode: 'Markdown' });
    await alertRef.set({ date: today, price, avg, diffPct });
    console.log('[gold-alert] alert sent!');
  } catch (e) {
    console.error('[gold-alert] failed to send message:', e);
  }
}

// Run every day at 9:00 Madrid time (UTC+2 in summer = 07:00 UTC)
cron.schedule('0 7 * * *', () => { void checkGoldBuyingOpportunity(); }, { timezone: 'Europe/Madrid' });
console.log('📅 Gold price alert scheduled (daily 09:00 Madrid)');

// ── Launch (polling, like MemoManager) ───────────────────────────────────────
void bot.launch(() => {
  console.log('🤖 KakeboGo bot started (polling)');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
