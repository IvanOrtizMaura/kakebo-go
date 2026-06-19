import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

admin.initializeApp();

const openaiApiKey = defineSecret('OPENAI_API_KEY');

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
  { secrets: [openaiApiKey] },
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

    // Verify Firebase Auth token
    const authHeader = req.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      await admin.auth().verifyIdToken(authHeader.slice(7));
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
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 1000,
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
