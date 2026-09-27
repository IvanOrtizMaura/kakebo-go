import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import OpenAI from 'openai';

admin.initializeApp();

const openaiApiKey = defineSecret('OPENAI_API_KEY');
const telegramBotToken = defineSecret('TELEGRAM_BOT_TOKEN');
const allowedChatId = defineSecret('TELEGRAM_ALLOWED_CHAT_ID');

const ALLOWED_ORIGINS = [
  'https://kakebo-go-23ec8.web.app',
  'https://kakebo-go-23ec8.firebaseapp.com',
  'http://localhost:4200',
];

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const chat = onRequest(
  { secrets: [openaiApiKey], invoker: 'public' },
  async (req, res) => {
    // CORS
    const origin = req.headers.origin ?? '';
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    // Verify Firebase Auth token (passed in body — hosting rewrites strip Authorization header)
    const idToken: string = req.body?.idToken ?? '';
    if (!idToken) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      await admin.auth().verifyIdToken(idToken);
    } catch {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    // Validate body
    const messages: OpenAIMessage[] = req.body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages array required' });
      return;
    }

    // Call OpenAI
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey.value()}`,
      },
      // Keep in sync with src/app/shared/services/ai-analyst.service.ts
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.3,
        max_tokens: 400,
      }),
    });

    if (!openaiRes.ok) {
      const error = await openaiRes.json().catch(() => ({}));
      res.status(openaiRes.status).json(error);
      return;
    }

    const data = await openaiRes.json() as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '';
    res.json({ content });
  }
);

// ── Telegram Bot webhook ──────────────────────────────────────────────────────
// Implemented WITHOUT Telegraf — plain fetch calls to the Telegram Bot API.
// This avoids CJS/ESM compatibility issues with Telegraf on Firebase Functions
// (Cloud Run) and matches the webhook model of a single request-response cycle.

interface InversionOroDoc {
  gramos?: number; pureza?: number; precio_compra?: number;
  formato?: string; pieza?: string; name?: string; spotPrecioCompra?: number;
}
interface FondoAhorroDoc {
  name?: string; total_amount?: number; monthly_amount?: number; is_active?: boolean;
}
interface DeudaDoc {
  name?: string; type?: string; total_amount?: number;
  amount_remaining?: number; monthly_payment?: number; is_active?: boolean;
}
interface AportacionDoc {
  importe?: number; fecha?: unknown; nota?: string;
}

// ── Minimal Telegram update types ────────────────────────────────────────────
interface TgChat { id: number; type?: string; }
interface TgMessage {
  message_id: number;
  chat: TgChat;
  text?: string;
  date?: number;
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
}

// ── Telegram API helpers (plain fetch, no SDK) ───────────────────────────────

const TG_API = 'https://api.telegram.org/bot';

async function tgCall(token: string, method: string, payload: unknown): Promise<void> {
  try {
    const res = await fetch(`${TG_API}${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[tg] ${method} failed: ${res.status} ${body}`);
    }
  } catch (e) {
    console.error(`[tg] ${method} network error:`, e);
  }
}

async function sendTelegramMessage(
  token: string,
  chatId: number,
  text: string,
  opts: { parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML' } = {}
): Promise<void> {
  const payload: Record<string, unknown> = { chat_id: chatId, text };
  if (opts.parseMode) payload['parse_mode'] = opts.parseMode;
  await tgCall(token, 'sendMessage', payload);
}

async function sendChatAction(token: string, chatId: number, action: string): Promise<void> {
  await tgCall(token, 'sendChatAction', { chat_id: chatId, action });
}

// Try Markdown first; fall back to plain text if Telegram rejects the markup.
async function replyMarkdownWithFallback(
  token: string,
  chatId: number,
  text: string
): Promise<void> {
  try {
    const res = await fetch(`${TG_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    if (res.ok) return;
    const body = await res.text().catch(() => '');
    console.warn(`[tg] Markdown sendMessage failed (${res.status}), retrying as plain text: ${body}`);
    await sendTelegramMessage(token, chatId, text);
  } catch (e) {
    console.error('[tg] Markdown send failed, plain fallback:', e);
    await sendTelegramMessage(token, chatId, text);
  }
}


async function buildFinancialContext(uid: string): Promise<string> {
  const db = admin.firestore();
  const now = new Date();
  const year = now.getFullYear();
  const userRef = db.collection('users').doc(uid);

  console.log('[ctx] uid:', uid, 'year:', year);

  // Fetch top-level collections + months list all in parallel
  const [monthsSnap, inversionesSnap, fondosSnap, deudasSnap, pensionesSnap] = await Promise.all([
    userRef.collection('months').where('year', '==', year).get(),
    userRef.collection('inversiones').get().catch(() => null),
    userRef.collection('fondos_ahorro').where('is_active', '==', true).get().catch(() => null),
    userRef.collection('deudas').where('is_active', '==', true).get().catch(() => null),
    userRef.collection('pensiones_aportaciones').get().catch(() => null),
  ]);

  console.log('[ctx] months:', monthsSnap.size, '| inversiones:', inversionesSnap?.size ?? 'err',
    '| fondos:', fondosSnap?.size ?? 'err', '| deudas:', deudasSnap?.size ?? 'err');

  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const sections: string[] = [];

  // ── Monthly cash flow — all months fetched IN PARALLEL ────────────────────
  const sortedMonths = monthsSnap.docs.sort((a, b) =>
    (a.data()['month'] ?? 0) - (b.data()['month'] ?? 0));

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

  // ── Inversiones en oro ─────────────────────────────────────────────────────
  if (inversionesSnap && !inversionesSnap.empty) {
    const invLines = ['INVERSIONES EN ORO:'];
    let totalGramos = 0;
    let totalInvertido = 0;
    inversionesSnap.docs.forEach(d => {
      const inv = d.data() as InversionOroDoc;
      const gramos = inv.gramos ?? 0;
      const precio = inv.precio_compra ?? 0;
      const pureza = inv.pureza ?? 999.9;
      const karat = Math.round(pureza / 41.666);
      const precioG = gramos > 0 ? (precio / gramos).toFixed(2) : '—';
      const pieza = inv.pieza ?? inv.name ?? 'Sin nombre';
      const formato = inv.formato ?? 'Lingote';
      totalGramos += gramos;
      totalInvertido += precio;
      let line = `- ${pieza} (${formato}, ${karat}k): ${gramos}g comprado por ${precio}€ (${precioG}€/g)`;
      if (inv.spotPrecioCompra) {
        const spotKarat = (inv.spotPrecioCompra * (pureza / 999.9)).toFixed(2);
        line += ` — spot compra ${karat}k: ${spotKarat}€/g`;
      }
      invLines.push(line);
    });
    invLines.push(`Total: ${totalGramos.toFixed(2)}g invertidos ${totalInvertido.toFixed(2)}€`);
    sections.push(invLines.join('\n'));
  }

  // ── Fondos de ahorro ───────────────────────────────────────────────────────
  if (fondosSnap && !fondosSnap.empty) {
    const fondoLines = ['FONDOS DE AHORRO (activos):'];
    fondosSnap.docs.forEach(d => {
      const f = d.data() as FondoAhorroDoc;
      fondoLines.push(`- ${f.name ?? '?'}: objetivo ${f.total_amount ?? 0}€, aportación mensual ${f.monthly_amount ?? 0}€`);
    });
    sections.push(fondoLines.join('\n'));
  }

  // ── Deudas ─────────────────────────────────────────────────────────────────
  if (deudasSnap && !deudasSnap.empty) {
    const deudaLines = ['DEUDAS (activas):'];
    let totalPendiente = 0;
    deudasSnap.docs.forEach(d => {
      const deuda = d.data() as DeudaDoc;
      const pendiente = deuda.amount_remaining ?? 0;
      totalPendiente += pendiente;
      deudaLines.push(
        `- ${deuda.name ?? '?'} (${deuda.type ?? '?'}): original ${deuda.total_amount ?? 0}€, pendiente ${pendiente}€, cuota ${deuda.monthly_payment ?? 0}€/mes`
      );
    });
    deudaLines.push(`Total pendiente: ${totalPendiente.toFixed(2)}€`);
    sections.push(deudaLines.join('\n'));
  }

  // ── Pensiones ──────────────────────────────────────────────────────────────
  if (pensionesSnap && !pensionesSnap.empty) {
    const pensionLines = ['PENSIONES (aportaciones):'];
    let totalPensiones = 0;
    pensionesSnap.docs.forEach(d => {
      const ap = d.data() as AportacionDoc;
      const importe = ap.importe ?? 0;
      totalPensiones += importe;
      const fechaStr = ap.fecha
        ? new Date((ap.fecha as { seconds?: number }).seconds
            ? (ap.fecha as { seconds: number }).seconds * 1000
            : String(ap.fecha)
          ).toLocaleDateString('es-ES')
        : '?';
      pensionLines.push(`- ${fechaStr}: ${importe}€${ap.nota ? ` — ${ap.nota}` : ''}`);
    });
    pensionLines.push(`Total aportado: ${totalPensiones.toFixed(2)}€`);
    sections.push(pensionLines.join('\n'));
  }

  const todayStr = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  return [
    `Eres un asesor financiero personal experto. Hoy es ${todayStr}.`,
    `DATOS FINANCIEROS AÑO ${year}:`,
    sections.join('\n\n') || 'Sin datos registrados todavía.',
    '',
    'ESTILO: Responde en español, muy breve, directo. Una frase cuando sea posible. Usa **negrita** para cifras clave.',
  ].join('\n');
}

// ── Session management (in-memory, per-instance) ─────────────────────────────
// NOTE: Firebase Functions instances are ephemeral. Sessions survive as long as
// the same warm instance handles requests. With minInstances=1 the primary
// instance keeps context; when it scales up, new instances start with an empty
// map. That's acceptable for a personal single-user bot.

interface TgSession {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  lastActivity: number;
}

const sessions = new Map<number, TgSession>();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min
const MAX_HISTORY = 20;

function getOrCreateSession(chatId: number): TgSession {
  const existing = sessions.get(chatId);
  if (existing && Date.now() - existing.lastActivity < SESSION_TTL_MS) return existing;
  const session: TgSession = { messages: [], lastActivity: Date.now() };
  sessions.set(chatId, session);
  return session;
}

function trimHistory(session: TgSession): void {
  if (session.messages.length > MAX_HISTORY) {
    session.messages = session.messages.slice(-MAX_HISTORY);
  }
}

// Lazy OpenAI client — created per-instance, reused across requests
let openaiClient: OpenAI | null = null;
function getOpenAI(apiKey: string): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

// ── Command handlers ─────────────────────────────────────────────────────────

const HELP_TEXT =
  '💬 Puedo responder preguntas sobre:\n' +
  '• Ingresos y gastos del mes\n' +
  '• Balance mensual\n' +
  '• Deudas pendientes\n' +
  '• Inversiones en oro\n' +
  '• Fondos de ahorro\n\n' +
  'Comandos:\n' +
  '/start — Bienvenida\n' +
  '/help — Esta ayuda\n' +
  '/reset — Reiniciar conversación\n' +
  '/id — Ver tu chatId';

const START_TEXT =
  '👋 ¡Hola! Soy tu asesor financiero de KakeboGo.\n' +
  'Pregúntame sobre tus ingresos, gastos, ahorros, deudas o inversiones.\n\n' +
  'Escribe /help para ver todos los comandos.';

async function handleTextMessage(
  token: string,
  apiKey: string,
  chatId: number,
  text: string
): Promise<void> {
  console.log(`[tg] text from ${chatId}: ${text}`);

  // Slash-commands take priority
  const trimmed = text.trim();
  if (trimmed.startsWith('/')) {
    const cmd = trimmed.split(/[\s@]/, 1)[0].toLowerCase();
    if (cmd === '/start') { await sendTelegramMessage(token, chatId, START_TEXT); return; }
    if (cmd === '/help')  { await sendTelegramMessage(token, chatId, HELP_TEXT); return; }
    if (cmd === '/id')    { await sendTelegramMessage(token, chatId, `🆔 Tu chatId es: ${chatId}`); return; }
    if (cmd === '/debug') {
      console.log('[tg] /debug: about to send message, token length:', token.length, 'chatId:', chatId);
      const debugRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `OK ${new Date().toISOString()}` }),
      });
      console.log('[tg] /debug: send result status:', debugRes.status);
      return;
    }
    if (cmd === '/reset') {
      sessions.delete(chatId);
      await sendTelegramMessage(token, chatId, '🔄 Conversación reiniciada.');
      return;
    }
    // Unknown command — treat rest as free-form question, fall through
  }

  // Typing indicator (fire-and-forget style — we still await so the request
  // is fully sent before we move on, but we don't block on failures)
  void sendChatAction(token, chatId, 'typing');

  // Find uid by telegram_chat_id — avoids picking wrong user when multiple docs exist
  const db = admin.firestore();
  const usersSnap = await db.collection('users').where('telegram_chat_id', '==', chatId).limit(1).get();
  const uid = usersSnap.docs[0]?.id;
  console.log('[tg] chatId:', chatId, '| uid found:', uid ?? 'NONE', '| docs:', usersSnap.size);
  if (!uid) {
    await sendTelegramMessage(token, chatId, '⚠️ No hay datos financieros disponibles.');
    return;
  }

  const session = getOrCreateSession(chatId);
  session.messages.push({ role: 'user', content: text });
  trimHistory(session);

  try {
    const systemPrompt = await buildFinancialContext(uid);
    console.log('[tg] context length:', systemPrompt.length, '| preview:', systemPrompt.slice(0, 150));

    const openai = getOpenAI(apiKey);
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...session.messages,
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const reply = completion.choices[0]?.message?.content ?? '⚠️ No pude procesar tu pregunta.';
    session.messages.push({ role: 'assistant', content: reply });
    session.lastActivity = Date.now();

    await replyMarkdownWithFallback(token, chatId, reply);
  } catch (e) {
    console.error('[tg] openai error:', e);
    await sendTelegramMessage(token, chatId, '⚠️ Error al procesar tu pregunta. Inténtalo de nuevo.');
  }
}

export const telegramWebhook = onRequest(
  {
    secrets: [telegramBotToken, openaiApiKey, allowedChatId],
    invoker: 'public',
    timeoutSeconds: 300,
    minInstances: 1,
  },
  async (req, res) => {
    // Telegram only ever POSTs to the webhook. Reject anything else quickly.
    if (req.method !== 'POST') {
      res.status(200).send('OK');
      return;
    }

    // Resolve secrets. If TELEGRAM_ALLOWED_CHAT_ID is missing/blank we treat
    // it as "no filter" (log & warn) rather than silently drop everything.
    const token = telegramBotToken.value();
    const apiKey = openaiApiKey.value();
    const allowedRaw = (allowedChatId.value() ?? '').trim();
    const allowedId = allowedRaw ? Number.parseInt(allowedRaw, 10) : NaN;

    if (!token) {
      console.error('[tg] TELEGRAM_BOT_TOKEN missing');
      res.status(200).send('OK');
      return;
    }

    // Always ack Telegram immediately-after-processing to avoid retries.
    // We *await* processing so ephemeral Cloud Run instances don't get frozen
    // before the OpenAI call finishes.
    try {
      const update = req.body as TgUpdate | undefined;
      if (!update) {
        console.warn('[tg] empty update body');
        res.status(200).send('OK');
        return;
      }

      const msg = update.message ?? update.edited_message;
      if (!msg || !msg.chat || typeof msg.chat.id !== 'number') {
        console.log('[tg] update without message/chat — ignoring', { update_id: update.update_id });
        res.status(200).send('OK');
        return;
      }

      const chatId = msg.chat.id;

      // Authorization
      if (!Number.isNaN(allowedId) && chatId !== allowedId) {
        console.warn(`[tg] rejected chatId=${chatId} (expected ${allowedId})`);
        res.status(200).send('OK');
        return;
      }
      if (Number.isNaN(allowedId)) {
        console.warn('[tg] TELEGRAM_ALLOWED_CHAT_ID not set — accepting all chats');
      }

      const text = msg.text;
      if (typeof text !== 'string' || text.length === 0) {
        // Non-text message (photo/sticker/etc). Politely ignore.
        console.log(`[tg] non-text message from ${chatId} — ignoring`);
        res.status(200).send('OK');
        return;
      }

      await handleTextMessage(token, apiKey, chatId, text);
    } catch (e) {
      console.error('[tg] webhook handler error:', e);
    }

    res.status(200).send('OK');
  }
);
