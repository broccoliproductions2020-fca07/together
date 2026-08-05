/**
 * One-time, emulator-only migration for Activities created before
 * `visibleUntil` became the feed boundary. It cannot target a cloud project:
 * a local Firestore emulator host is mandatory and the project id is fixed to
 * demo-together.
 *
 * Usage:
 *   node scripts/backfill-activity-visible-until.mjs           # dry run
 *   node scripts/backfill-activity-visible-until.mjs --apply   # local write
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('./firebase-admin-tools.cjs');

const PROJECT_ID = 'demo-together';
const PAGE_SIZE = 300;
const apply = process.argv.slice(2).includes('--apply');
const unsupportedArgs = process.argv.slice(2).filter((argument) => argument !== '--apply');

if (unsupportedArgs.length) {
  throw new Error(`Unbekannte Option: ${unsupportedArgs.join(', ')}`);
}

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!emulatorHost) {
  throw new Error(
    'Dieses Backfill läuft ausschließlich lokal. Setze FIRESTORE_EMULATOR_HOST auf einen lokalen Emulator.',
  );
}

const host = emulatorHost.split(':')[0];
if (!['127.0.0.1', 'localhost', '0.0.0.0'].includes(host)) {
  throw new Error('Cloud-Zugriff ist für dieses Backfill absichtlich gesperrt.');
}

function timestampMillis(value) {
  return typeof value?.toMillis === 'function' ? value.toMillis() : Number.NaN;
}

function scheduledVisibilityMillis(activity) {
  const endMs = typeof activity.endsAt === 'string' ? Date.parse(activity.endsAt) : Number.NaN;
  if (Number.isFinite(endMs)) return endMs;

  const startMs = typeof activity.startsAt === 'string' ? Date.parse(activity.startsAt) : Number.NaN;
  if (Number.isFinite(startMs)) return startMs;

  // The oldest malformed documents have no schedule. Preserve their former
  // lifecycle instead of inventing an earlier end: before this migration the
  // feed itself used expireAt as its boundary.
  return timestampMillis(activity.expireAt);
}

function hasTimestamp(value) {
  return Number.isFinite(timestampMillis(value));
}

async function main() {
  const app = admin.initializeApp({ projectId: PROJECT_ID }, 'activity-visible-until-backfill');
  const db = app.firestore();
  let lastDocument;
  let scanned = 0;
  let skipped = 0;
  let updated = 0;
  let unresolved = 0;

  try {
    do {
      let query = db
        .collection('activities')
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(PAGE_SIZE);
      if (lastDocument) query = query.startAfter(lastDocument);

      const snapshot = await query.get();
      if (snapshot.empty) break;
      lastDocument = snapshot.docs[snapshot.docs.length - 1];
      const batch = db.batch();
      let writesInPage = 0;

      for (const document of snapshot.docs) {
        scanned += 1;
        const activity = document.data();
        if (hasTimestamp(activity.visibleUntil)) {
          skipped += 1;
          continue;
        }

        const visibleUntil = scheduledVisibilityMillis(activity);
        if (!Number.isFinite(visibleUntil)) {
          unresolved += 1;
          console.warn(`[activity-backfill] ${document.id}: keine verwendbare Zeit, übersprungen.`);
          continue;
        }

        updated += 1;
        if (apply) {
          batch.update(document.ref, {
            visibleUntil: admin.firestore.Timestamp.fromMillis(visibleUntil),
          });
          writesInPage += 1;
        }
      }

      if (apply && writesInPage) await batch.commit();
      if (snapshot.size < PAGE_SIZE) break;
    } while (lastDocument);
  } finally {
    await app.delete();
  }

  console.log(
    `[activity-backfill] ${apply ? 'angewendet' : 'Vorschau'}: ${scanned} geprüft, ${updated} ergänzt, ${skipped} bereits aktuell, ${unresolved} übersprungen.`,
  );
}

main().catch((error) => {
  console.error('[activity-backfill] fehlgeschlagen:', error);
  process.exit(1);
});
