import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const args = new Set(process.argv.slice(2));
const projectFlag = process.argv.indexOf('--project');
const projectId = projectFlag >= 0 ? process.argv[projectFlag + 1] : undefined;
const apply = args.has('--apply');

if (!projectId) throw new Error('Usage: --project <firebase-project> [--apply]');
if (projectId === 'together-fca07' && !args.has('--allow-prod')) {
  throw new Error('Production requires the explicit --allow-prod flag.');
}

const app = initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);
const snapshots = await db.collection('timePlans').where('status', '==', 'collecting').get();
const legacy = snapshots.docs.filter((snapshot) => Array.isArray(snapshot.data().audienceUids));

console.log(`${legacy.length} active legacy time plan(s) found in ${projectId}.`);
if (!apply) {
  console.log('Dry run only. Add --apply to write projections and remove audienceUids.');
  process.exit(0);
}

let batch = db.batch();
let writes = 0;
let migrated = 0;

async function flush() {
  if (writes === 0) return;
  await batch.commit();
  batch = db.batch();
  writes = 0;
}

for (const snapshot of legacy) {
  const plan = snapshot.data();
  const audienceUids = [...new Set(plan.audienceUids.filter((uid) => typeof uid === 'string'))]
    .slice(0, 50);
  const memberUids = new Set(
    Array.isArray(plan.memberUids) ? plan.memberUids.filter((uid) => typeof uid === 'string') : [],
  );
  const safePlan = { ...plan };
  delete safePlan.memberUids;
  delete safePlan.audienceUids;

  if (writes + audienceUids.length + 1 > 400) await flush();
  audienceUids.forEach((audienceUid) => {
    batch.set(db.doc(`timePlanAudience/${snapshot.id}_${audienceUid}`), {
      ...safePlan,
      planId: snapshot.id,
      audienceUid,
      joined: memberUids.has(audienceUid),
      memberCount: Math.max(1, memberUids.size),
      audienceCount: audienceUids.length,
    });
    writes += 1;
  });
  batch.update(snapshot.ref, {
    audienceCount: audienceUids.length,
    audienceUids: FieldValue.delete(),
  });
  writes += 1;
  migrated += 1;
}

await flush();
console.log(`${migrated} time plan(s) migrated.`);
