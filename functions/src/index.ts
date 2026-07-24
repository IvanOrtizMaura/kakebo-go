import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

admin.initializeApp();

const openaiApiKey = defineSecret('OPENAI_API_KEY');
const telegramBotToken = defineSecret('TELEGRAM_BOT_TOKEN');

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

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string };
    text?: string;
  };
}

async function sendTelegramMessage(token: string, chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

async function buildFinancialContext(uid: string): Promise<string> {
  const db = admin.firestore();
  const now = new Date();
  const year = now.getFullYear();

  // Fetch all months for the year
  const monthsSnap = await db.collection('users').doc(uid).collection('months')
    .where('year', '==', year).get();

  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const sortedMonths = monthsSnap.docs.sort((a, b) => {
    return (a.data()['month'] ?? 0) - (b.data()['month'] ?? 0);
  });

  const sections: string[] = [];

  for (const monthDoc of sortedMonths) {
    const monthData = monthDoc.data();
    const monthLabel = `${monthNames[(monthData['month'] ?? 1) - 1]} ${year}`;
    const monthId = monthDoc.id;
    const base = db.collection('users').doc(uid).collection('months').doc(monthId);

    const [ingresos, facturas, gastos, ahorros] = await Promise.all([
      base.collection('ingresos').orderBy('order_index').get(),
      base.collection('facturas').orderBy('order_index').get(),
      base.collection('gastos').orderBy('order_index').get(),
      base.collection('ahorros').orderBy('order_index').get(),
    ]);

    const totalIngresos = ingresos.docs.reduce((s, d) => s + (d.data()['real'] || 0), 0);
    const totalEsperado = ingresos.docs.reduce((s, d) => s + (d.data()['esperado'] || 0), 0);
    const totalGastos = gastos.docs.reduce((s, d) => s + (d.data()['real'] || 0), 0);
    const totalFacturas = facturas.docs.reduce((s, d) => s + (d.data()['real'] || 0), 0);
    const totalAhorros = ahorros.docs.reduce((s, d) => s + (d.data()['real'] || 0), 0);

    if (totalIngresos === 0 && totalEsperado === 0 && totalGastos === 0 && totalFacturas === 0) continue;

    const lines = [`=== ${monthLabel} ===`];
    if (totalIngresos > 0 || totalEsperado > 0) {
      lines.push(`Ingresos: cobrado ${totalIngresos}€ / previsto ${totalEsperado}€`);
      // Group by fuente
      const byFuente = new Map<string, number>();
      ingresos.docs.forEach(d => {
        const key = (d.data()['fuente'] ?? '').toLowerCase().trim();
        byFuente.set(key, (byFuente.get(key) ?? 0) + (d.data()['real'] || 0));
      });
      byFuente.forEach((v, k) => lines.push(`  - ${k}: ${v}€`));
    }
    if (totalFacturas > 0) lines.push(`Facturas: ${totalFacturas}€`);
    if (totalGastos > 0) lines.push(`Gastos: ${totalGastos}€`);
    if (totalAhorros > 0) lines.push(`Ahorros: ${totalAhorros}€`);
    const balance = totalIngresos - totalFacturas - totalGastos - totalAhorros;
    lines.push(`Balance: ${balance}€`);
    sections.push(lines.join('\n'));
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

export const telegramWebhook = onRequest(
  { secrets: [telegramBotToken, openaiApiKey], invoker: 'public' },
  async (req, res) => {
    res.status(200).send('OK'); // Always 200 to Telegram

    if (req.method !== 'POST') return;

    const update: TelegramUpdate = req.body;
    const message = update?.message;
    if (!message?.text || !message.chat?.id) return;

    const chatId = message.chat.id;
    const token = telegramBotToken.value();
    const text = message.text.trim();

    // Verify allowed chat ID (stored in Firestore user_profiles as telegram_chat_id)
    const db = admin.firestore();
    const profilesSnap = await db.collectionGroup('user_profiles')
      .where('telegram_chat_id', '==', chatId).limit(1).get()
      .catch(() => null);

    // If no profile linked, try to find by matching — for single-user app,
    // accept any registered user if no chat_id is set yet (first-time linking)
    let uid: string | null = null;

    if (profilesSnap && !profilesSnap.empty) {
      uid = profilesSnap.docs[0].ref.parent.parent?.id ?? null;
    } else {
      // Single-user fallback: find the first user with no telegram_chat_id set
      const allProfilesSnap = await db.collection('users').listDocuments()
        .then(docs => Promise.all(docs.map(d => d.get())))
        .catch(() => []);

      for (const docSnap of allProfilesSnap) {
        if (docSnap.exists) {
          const data = docSnap.data() ?? {};
          if (!data['telegram_chat_id']) {
            // Link this user to the chat
            uid = docSnap.id;
            await docSnap.ref.update({ telegram_chat_id: chatId });
            await sendTelegramMessage(token, chatId,
              `✅ Bot vinculado correctamente. ¡Hola! Soy tu asesor financiero. Pregúntame lo que quieras sobre tus finanzas.`);
            return;
          }
        }
      }

      await sendTelegramMessage(token, chatId, '❌ No autorizado.');
      return;
    }

    if (!uid) {
      await sendTelegramMessage(token, chatId, '❌ No autorizado.');
      return;
    }

    // Handle /start command
    if (text === '/start') {
      await sendTelegramMessage(token, chatId,
        '👋 ¡Hola! Soy tu asesor financiero de KakeboGo. Pregúntame sobre tus gastos, ingresos, ahorros o cualquier cosa de tus finanzas.');
      return;
    }

    // Build context and call OpenAI
    try {
      const systemPrompt = await buildFinancialContext(uid);

      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey.value()}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          temperature: 0.3,
          max_tokens: 400,
        }),
      });

      const data = await openaiRes.json() as { choices?: { message?: { content?: string } }[] };
      const reply = data.choices?.[0]?.message?.content ?? 'No pude procesar tu pregunta.';
      await sendTelegramMessage(token, chatId, reply);
    } catch {
      await sendTelegramMessage(token, chatId, '⚠️ Error al procesar tu pregunta. Inténtalo de nuevo.');
    }
  }
);
