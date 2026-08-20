/**
 * Rebuilds the private friendSearch index from authoritative profile/settings
 * documents. It is dry-run by default; a cloud write always needs BOTH an
 * explicit project alias and --apply.
 *
 *   node scripts/backfill-friend-search.mjs --project dev
 *   node scripts/backfill-friend-search.mjs --project dev --apply
 *   node scripts/backfill-friend-search.mjs --project prod --apply
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('./firebase-admin-tools.cjs');
const { buildFriendSearchFields } = require('../functions/friend-search');

const PROJECTS = { dev: 'together-dev-ce394', prod: 'together-fca07' };
const args = process.argv.slice(2);
const projectAlias = args.at(args.indexOf('--project') + 1);
const projectId = PROJECTS[projectAlias];
const apply = args.includes('--apply');

if (!projectId) {
  throw new Error('Usage: node scripts/backfill-friend-search.mjs --project dev|prod [--apply]');
}

const app = admin.initializeApp(
  { projectId, credential: admin.credential.applicationDefault() },
  `friend-search-backfill-${projectAlias}`,
);
const db = app.firestore();
const { FieldPath, Timestamp } = admin.firestore;
let lastDocument = null;
let scanned = 0;
let indexed = 0;
let skipped = 0;

try {
  while (true) {
    const page = await (lastDocument
      ? db.collection('publicProfiles').orderBy(FieldPath.documentId()).startAfter(lastDocument).limit(300)
      : db.collection('publicProfiles').orderBy(FieldPath.documentId()).limit(300)
    ).get();
    if (page.empty) break;
    const users = await db.getAll(...page.docs.map((profile) => db.doc(`users/${profile.id}`)));
    const batch = db.batch();
    page.docs.forEach((profileSnapshot, index) => {
      scanned += 1;
      const fields = buildFriendSearchFields(
        profileSnapshot.data(),
        users[index]?.data()?.friendRequestPolicy ?? 'anyone',
      );
      if (!fields) {
        skipped += 1;
        return;
      }
      indexed += 1;
      if (apply) {
        batch.set(db.doc(`friendSearch/${profileSnapshot.id}`), {
          ...fields,
          updatedAt: Timestamp.now(),
        });
      }
    });
    if (apply) await batch.commit();
    lastDocument = page.docs.at(-1);
    if (page.size < 300) break;
  }
  console.log(
    `${apply ? 'Backfill abgeschlossen' : 'Dry run'} (${projectAlias}): ${indexed} Indexeinträge, ${skipped} übersprungen, ${scanned} Profile geprüft.`,
  );
} finally {
  await app.delete();
}
