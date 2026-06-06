/**
 * reset-user-data.mjs
 * Deletes ALL Firestore documents belonging to a specific user.
 * Usage: node scripts/reset-user-data.mjs <USER_ID>
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ───────────────────────────────────────────────────────────────────
const PROJECT_ID = 'kakebo-go-23ec8';

// Collections where docs have a user_id field (top-level)
const USER_ID_COLLECTIONS = [
  'ingresos',
  'facturas',
  'ahorros',
  'months',
  'deudas',
  'deudas_monthly',
  'fondos_ahorro',
  'fondos_ahorro_monthly',
  'ingreso_templates',
  'ahorro_templates',
  'pareja',
];

// ── Init ─────────────────────────────────────────────────────────────────────
const userId = process.argv[2];
if (!userId) {
  console.error('❌  Usage: node scripts/reset-user-data.mjs <USER_ID>');
  process.exit(1);
}

// Try to find a service account key
const keyPaths = [
  resolve(__dirname, '../serviceAccountKey.json'),
  resolve(__dirname, '../.serviceAccountKey.json'),
  resolve(process.env.HOME || '', '.firebase/kakebo-go-23ec8-key.json'),
];
const keyPath = keyPaths.find(p => existsSync(p));

let app;
if (keyPath) {
  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
  app = initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
  console.log(`🔑  Using service account key: ${keyPath}`);
} else {
  // Fall back to Application Default Credentials (firebase login --reauth)
  app = initializeApp({ projectId: PROJECT_ID });
  console.log('🔑  Using Application Default Credentials');
}

const db = getFirestore(app);

// ── Helpers ──────────────────────────────────────────────────────────────────
async function deleteQueryBatch(query) {
  const snapshot = await query.get();
  if (snapshot.empty) return 0;
  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  return snapshot.size;
}

async function deleteUserDocs(collectionName) {
  let total = 0;
  let page;
  do {
    const q = db.collection(collectionName)
      .where('user_id', '==', userId)
      .limit(500);
    const count = await deleteQueryBatch(q);
    total += count;
    page = count;
  } while (page > 0);
  return total;
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log(`\n🗑️  Resetting data for user: ${userId}`);
console.log(`   Project: ${PROJECT_ID}\n`);

let grandTotal = 0;
for (const col of USER_ID_COLLECTIONS) {
  const count = await deleteUserDocs(col);
  if (count > 0) console.log(`   ✓ ${col}: ${count} docs deleted`);
  else console.log(`   · ${col}: nothing to delete`);
  grandTotal += count;
}

// Also delete user doc from users collection
try {
  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();
  if (userDoc.exists) {
    await userRef.delete();
    console.log(`   ✓ users/${userId}: deleted`);
    grandTotal++;
  }
} catch (e) {
  console.log(`   · users/${userId}: ${e.message}`);
}

console.log(`\n✅  Done! ${grandTotal} documents deleted.\n`);
process.exit(0);
