import { createRequire } from 'node:module';

import { LANDING_CENTRE, LANDING_PLAN_OFFSET } from './lib/seed-scenarios.mjs';

const require = createRequire(import.meta.url);
const admin = require('./firebase-admin-tools.cjs');

/**
 * Two Terminfindungen for the running emulator, one per role.
 *
 * Run AFTER `npm run emulators:seed` — it reuses that roster and befriends
 * nobody itself. Shapes mirror what `createTimePlan` / `joinTimePlan` write; if
 * one of those changes, change this too (same rule as the main seed).
 *
 *   node scripts/seed-time-plan.mjs                    (drei Dev-Runden)
 *   node scripts/seed-time-plan.mjs --scenario landing (eine Aufnahme-Runde)
 */

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

const PROJECT_ID = 'demo-together';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Mirrors TIME_PLAN_RETENTION_MS in functions/index.js — a round dies with the
// thing it was arranging, on the same clock as an activity chat. Change both.
const RETENTION_MS = 12 * HOUR;
const STEP = 5 * 60 * 1000;

/** Near the seed roster's centre, so the locked Activity lands a pin you can
 * actually see. Without a place the resulting Activity has no coordinate and
 * therefore no marker at all — which made the payoff of locking invisible. */
const PLACE = {
  label: 'Volkspark am Weinberg',
  latitude: 52.5232,
  longitude: 13.4062,
  visibility: 'pin',
};

const args = process.argv.slice(2);
const stringArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1] : undefined;
  return typeof value === 'string' && !value.startsWith('--') ? value : fallback;
};
const numberArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? Number(args[index + 1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
};
const SCENARIO = stringArg('scenario', 'dev');
/**
 * Muss mit `scripts/seed-emulators.mjs` uebereinstimmen: `dev` in Berlin,
 * `landing` auf Flannigan's Post in Augsburg. Beide Skripte lesen dieselbe
 * Konstante, damit die Runde nicht in einer anderen Stadt landet als die
 * Aktivitaeten, zu denen sie gehoert.
 */
const DEFAULT_CENTRE =
  SCENARIO === 'landing'
    ? { lat: LANDING_CENTRE.lat, lng: LANDING_CENTRE.lng }
    : { lat: 52.5208, lng: 13.4095 };
const CENTRE = {
  lat: numberArg('lat', DEFAULT_CENTRE.lat),
  lng: numberArg('lng', DEFAULT_CENTRE.lng),
};

const now = Date.now();
const ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);
const iso = (ms) => new Date(ms).toISOString();

/** Local wall-clock time on a future day, snapped to the 5-minute grid the
 * server insists on. */
function dayAt(daysAhead, hour, minute = 0) {
  const base = new Date(now + daysAhead * DAY);
  base.setHours(hour, minute, 0, 0);
  return Math.round(base.getTime() / STEP) * STEP;
}

function windowsFor(prefix, spec) {
  return spec.map(([daysAhead, fromHour, toHour], index) => ({
    id: `${prefix}_w${index + 1}`,
    groupId: `${prefix}_g1`,
    startsAt: iso(dayAt(daysAhead, fromHour)),
    endsAt: iso(dayAt(daysAhead, toHour)),
  }));
}

function memberDoc(profile, role, responsesByWindow, expireAt) {
  return {
    uid: profile.uid,
    displayName: profile.displayName,
    initials: profile.initials,
    role,
    responseStatus: 'responded',
    responsesByWindow,
    basedOnRevision: 1,
    updatedAt: ts(now),
    expireAt: ts(expireAt),
  };
}

/** A slice of a window, in the window's own clock. */
function part(window, fromMinutes, toMinutes) {
  const start = Date.parse(window.startsAt);
  return [
    {
      startsAt: iso(start + fromMinutes * 60 * 1000),
      endsAt: iso(start + toMinutes * 60 * 1000),
    },
  ];
}

function whole(window) {
  return [{ startsAt: window.startsAt, endsAt: window.endsAt }];
}

async function profileOf(db, uid, fallbackName) {
  const snapshot = await db.doc(`publicProfiles/${uid}`).get();
  const data = snapshot.data() ?? {};
  const displayName = data.displayName ?? fallbackName;
  return {
    uid,
    displayName,
    initials: data.initials ?? displayName.slice(0, 2).toUpperCase(),
  };
}

/* ──────────────────────────────────────────────── Aufnahme-Welt (landing) ── */

const LANDING_PLAN_ID = 'timePlan_landing_grillen';

/**
 * Drei Vorschläge an den drei Tagen nach heute.
 *
 * Vorher waren es feste Wochentage (Fr/Sa/So über `daysUntil`). Das las sich im
 * Code gut und war in der Aufnahme falsch: Läuft der Seed an einem Freitag,
 * springt das Freitag-Fenster eine Woche vor, während Samstag und Sonntag
 * morgen und übermorgen sind — drei Vorschläge, von denen einer sieben Tage
 * abseits liegt. Solange die Aktivitäten in den nächsten zwei Tagen liegen,
 * muss die Runde in derselben Woche bleiben.
 *
 * Die Uhrzeiten sind geblieben: zwei Abende und ein Vormittag. Die Schlüssel
 * heißen nicht mehr nach Wochentagen, weil sie keine mehr sind.
 */
const LANDING_WINDOWS = [
  { key: 'd1', daysAhead: 1, from: 18, to: 23 },
  { key: 'd2', daysAhead: 2, from: 17, to: 23 },
  { key: 'd3', daysAhead: 3, from: 11, to: 16 },
];

/**
 * Sieben Antworten. Die Zeiten sind so gewählt, dass die Verdichtung im
 * zweiten Fenster (`d2`) eine saubere Glocke ergibt — 2 · 3 · 4 · 5 · 6 · **7** · 6 ·
 * 5 · 4 · 3 —, ohne dass eine einzige Zeile dafür unglaubwürdig wird:
 *
 *   Mia beantwortet als Gastgeberin das ganze Fenster (genau das schreibt
 *   `createTimePlan`), Amelie muss um zehn weg, Noah kommt halb sechs und
 *   fährt halb zehn, Lisa kommt nach der Schicht, David dazwischen, Sofia erst
 *   um sieben, Elias hat nur die eineinhalb Stunden dazwischen frei.
 *
 * Der Gipfel liegt bei 19:30–21:00 und trägt alle sieben — der Slot, den der
 * Host festzurren würde. Freitag und Sonntag sind ebenfalls glockenförmig,
 * kommen aber nur auf fünf, damit der Vergleich der drei Zeilen eindeutig
 * ausgeht statt in einem Gleichstand zu enden.
 *
 * `null` heißt „kann an dem Tag nicht" — eine echte Antwort, nicht eine
 * fehlende. Ohne mindestens eine davon sähe die Runde aus, als hätte niemand
 * etwas anderes vor.
 */
const LANDING_MEMBERS = [
  { uid: 'seed-mia', name: 'Mia Sommer', role: 'host', d1: [18, 23], d2: [17, 23], d3: [11, 16] },
  {
    uid: 'seed-amelie',
    name: 'Amelie Wagner',
    role: 'member',
    d1: [20, 23],
    d2: [17, 22],
    d3: [11, 14],
  },
  {
    uid: 'seed-noah',
    name: 'Noah Fischer',
    role: 'member',
    d1: [18, 21],
    d2: [17.5, 21.5],
    d3: null,
  },
  { uid: 'seed-lisa', name: 'Lisa Becker', role: 'member', d1: null, d2: [18, 23], d3: [12, 16] },
  {
    uid: 'seed-david',
    name: 'David Klein',
    role: 'member',
    d1: [19, 22],
    d2: [18.5, 22.5],
    d3: [13, 16],
  },
  {
    uid: 'seed-sofia',
    name: 'Sofia Neumann',
    role: 'member',
    d1: null,
    d2: [19, 23],
    d3: [12, 15],
  },
  {
    uid: 'seed-sebbo',
    name: 'Sebbo Regs',
    role: 'member',
    d1: [18, 23],
    d2: [19.5, 21],
    d3: null,
  },
];

/** Ein Slot in der Wanduhr des Fenstertages. 19.5 heißt 19:30. */
function clockSlot(window, fromHour, toHour) {
  const midnight = new Date(Date.parse(window.startsAt));
  midnight.setHours(0, 0, 0, 0);
  const base = midnight.getTime();
  return [{ startsAt: iso(base + fromHour * HOUR), endsAt: iso(base + toHour * HOUR) }];
}

async function seedLandingRound(db, centre) {
  const windows = LANDING_WINDOWS.map((spec, index) => ({
    key: spec.key,
    id: `tplanding_w${index + 1}`,
    groupId: 'tplanding_g1',
    startsAt: iso(dayAt(spec.daysAhead, spec.from)),
    endsAt: iso(dayAt(spec.daysAhead, spec.to)),
  }));
  const expireAt = Math.max(...windows.map((w) => Date.parse(w.endsAt))) + RETENTION_MS;

  // Frühere Mitglieder zuerst weg: `set` auf dem Plan ersetzt `memberUids`,
  // nicht die Subcollection. Ein übriggebliebenes Mitglied wäre eine Antwort,
  // die in keiner Liste steht — ein Zustand, den der echte Fluss nie erzeugt.
  const stale = await db.collection(`timePlans/${LANDING_PLAN_ID}/timePlanMembers`).get();
  await Promise.all(stale.docs.map((entry) => entry.ref.delete()));

  const profiles = await Promise.all(
    LANDING_MEMBERS.map((member) => profileOf(db, member.uid, member.name)),
  );
  const host = profiles[0];

  const plan = {
    hostId: host.uid,
    hostName: host.displayName,
    hostInitials: host.initials,
    title: 'Grillen am Wasser',
    category: 'essen',
    place: {
      label: 'Lechwiese',
      // Zwei Rasterschritte südlich der Kartenmitte: frei von den vier
      // Aktivitätsmarkern und noch im Bild der Hero-Kamera.
      // Das suedlichste der sechs Baender. Die Zahl steht in
      // scripts/lib/seed-scenarios.mjs neben allen anderen, sonst waere die
      // Runde der eine Marker, dessen Abstand niemand nachrechnen kann.
      latitude: Number((centre.lat + LANDING_PLAN_OFFSET.north / 111_320).toFixed(6)),
      longitude: Number(
        (
          centre.lng +
          LANDING_PLAN_OFFSET.east / (111_320 * Math.cos((centre.lat * Math.PI) / 180))
        ).toFixed(6),
      ),
      visibility: 'pin',
    },
    sourceWindows: windows.map(({ key: _key, ...rest }) => rest),
    revision: 1,
    status: 'collecting',
    // Neun Eingeladene, sieben haben geantwortet. Die Statuszeile zählt
    // PERSONEN („7 von 9 Antworten"); die Zahl in der Matrix ist etwas
    // anderes — Verfügbarkeit innerhalb der Antwortenden.
    audienceCount: 9,
    memberUids: LANDING_MEMBERS.map((member) => member.uid),
    createdAt: ts(now - 26 * HOUR),
    updatedAt: ts(now - 35 * 60 * 1000),
    expireAt: ts(expireAt),
  };

  const batch = db.batch();
  batch.set(db.doc(`timePlans/${LANDING_PLAN_ID}`), plan);

  const { memberUids: _members, ...projection } = plan;
  for (const member of LANDING_MEMBERS) {
    batch.set(db.doc(`timePlanAudience/${LANDING_PLAN_ID}_${member.uid}`), {
      ...projection,
      planId: LANDING_PLAN_ID,
      audienceUid: member.uid,
      joined: true,
      memberCount: LANDING_MEMBERS.length,
    });
  }

  LANDING_MEMBERS.forEach((member, index) => {
    const responses = {};
    for (const window of windows) {
      const slot = member[window.key];
      responses[window.id] = slot ? clockSlot(window, slot[0], slot[1]) : [];
    }
    batch.set(
      db.doc(`timePlans/${LANDING_PLAN_ID}/timePlanMembers/${member.uid}`),
      memberDoc(profiles[index], member.role, responses, expireAt),
    );
  });

  await batch.commit();

  // Die Glocke einmal ausrechnen und mitdrucken: Die Form ist der ganze Punkt
  // dieser Runde, und sie im Bild nachzuzählen wäre der teure Weg.
  const peaks = windows.map((window) => {
    const slots = LANDING_MEMBERS.map((member) => member[window.key]).filter(Boolean);
    const edges = [...new Set(slots.flat())].sort((a, b) => a - b);
    let best = 0;
    for (let index = 0; index < edges.length - 1; index += 1) {
      const count = slots.filter(
        ([from, to]) => from <= edges[index] && to >= edges[index + 1],
      ).length;
      best = Math.max(best, count);
    }
    return `${window.key} ${best}/${LANDING_MEMBERS.length}`;
  });
  console.log(
    `Terminfindung „${plan.title}": ${LANDING_MEMBERS.length} Antworten, ` +
      `${windows.length} Vorschläge, Spitzen ${peaks.join(' · ')}.`,
  );
}

async function main() {
  const app = admin.initializeApp({ projectId: PROJECT_ID }, `seed-time-plan-${Date.now()}`);
  const auth = app.auth();
  const db = app.firestore();

  // Die Aufnahme-Welt hat nach ihrem harten Reset kein Dev-Konto mehr und
  // braucht auch keins: Ihr Gastgeber steht im Roster.
  if (SCENARIO === 'landing') {
    await seedLandingRound(db, CENTRE);
    await app.delete();
    return;
  }

  const { users } = await auth.listUsers(1000);
  const devUser = users.find((user) => !user.uid.startsWith('seed-'));
  if (!devUser) {
    console.error('Kein Dev-Account gefunden. Erst `npm run emulators:seed` laufen lassen.');
    process.exit(1);
  }

  const me = await profileOf(db, devUser.uid, devUser.displayName ?? 'Du');
  const max = await profileOf(db, 'seed-max', 'Max Krüger');
  const lisa = await profileOf(db, 'seed-lisa', 'Lisa Becker');
  const jonas = await profileOf(db, 'seed-jonas', 'Jonas Pohl');

  // Wipe any member docs from a previous run first. `set` on the plan resets
  // memberUids, but a leftover member document does not go with it — and
  // joinTimePlan then sees a member who is not in the list, which is a state
  // the real flow can never produce. That mismatch is what made a seeded round
  // refuse a join.
  for (const planId of ['timePlan_seed_invited', 'timePlan_seed_hosted']) {
    const existing = await db.collection(`timePlans/${planId}/timePlanMembers`).get();
    await Promise.all(existing.docs.map((entry) => entry.ref.delete()));
  }

  const batch = db.batch();

  // ── 1. Someone else is asking. You are INVITED and have not answered, so the
  // sheet must open on the answer cards — and must be readable without being a
  // member, which is the whole reason for the invitee tier in firestore.rules.
  const invitedWindows = windowsFor('tpinv', [
    [1, 18, 23],
    [2, 19, 23],
    [3, 14, 20],
  ]);
  const invitedExpire = Math.max(...invitedWindows.map((w) => Date.parse(w.endsAt))) + RETENTION_MS;
  const invitedId = 'timePlan_seed_invited';
  const invitedPlan = {
    hostId: max.uid,
    hostName: max.displayName,
    hostInitials: max.initials,
    title: 'Grillen im Park',
    category: 'essen',
    place: PLACE,
    sourceWindows: invitedWindows,
    revision: 1,
    status: 'collecting',
    audienceCount: 4,
    memberUids: [max.uid, lisa.uid, jonas.uid],
    createdAt: ts(now - 2 * HOUR),
    updatedAt: ts(now - HOUR),
    expireAt: ts(invitedExpire),
  };
  batch.set(db.doc(`timePlans/${invitedId}`), invitedPlan);
  const { memberUids: _invitedMembers, ...invitedProjection } = invitedPlan;
  batch.set(db.doc(`timePlanAudience/${invitedId}_${me.uid}`), {
    ...invitedProjection,
    planId: invitedId,
    audienceUid: me.uid,
    joined: false,
    memberCount: 3,
  });
  batch.set(
    db.doc(`timePlans/${invitedId}/timePlanMembers/${max.uid}`),
    memberDoc(
      max,
      'host',
      Object.fromEntries(invitedWindows.map((w) => [w.id, whole(w)])),
      invitedExpire,
    ),
  );
  // Lisa can do all of day one, only the late half of day two, not day three.
  batch.set(
    db.doc(`timePlans/${invitedId}/timePlanMembers/${lisa.uid}`),
    memberDoc(
      lisa,
      'member',
      {
        [invitedWindows[0].id]: whole(invitedWindows[0]),
        [invitedWindows[1].id]: part(invitedWindows[1], 120, 240),
        [invitedWindows[2].id]: [],
      },
      invitedExpire,
    ),
  );
  // Jonas arrives late on day one and can do day three completely.
  batch.set(
    db.doc(`timePlans/${invitedId}/timePlanMembers/${jonas.uid}`),
    memberDoc(
      jonas,
      'member',
      {
        [invitedWindows[0].id]: part(invitedWindows[0], 60, 300),
        [invitedWindows[1].id]: [],
        [invitedWindows[2].id]: whole(invitedWindows[2]),
      },
      invitedExpire,
    ),
  );
  batch.set(db.doc(`timePlanInvites/${invitedId}_${me.uid}`), {
    planId: invitedId,
    inviteeUid: me.uid,
    status: 'pending',
    createdAt: ts(now - 2 * HOUR),
    expireAt: ts(invitedExpire),
  });
  batch.set(db.doc(`notifications/time_plan_${invitedId}_${me.uid}`), {
    recipientUid: me.uid,
    kind: 'time_plan_invite',
    title: `${max.displayName} sucht eine gemeinsame Zeit`,
    body: 'Grillen im Park',
    timePlanId: invitedId,
    createdAt: ts(now - 2 * HOUR),
    expireAt: ts(invitedExpire),
  });

  // ── 2. You are the HOST and everyone has answered, so the sheet opens on the
  // overview with a real spread to fan out and a slot worth locking.
  const hostedWindows = windowsFor('tphost', [
    [1, 17, 22],
    [4, 11, 16],
  ]);
  const hostedExpire = Math.max(...hostedWindows.map((w) => Date.parse(w.endsAt))) + RETENTION_MS;
  const hostedId = 'timePlan_seed_hosted';
  const hostedPlan = {
    hostId: me.uid,
    hostName: me.displayName,
    hostInitials: me.initials,
    title: 'Brunch oder Kino',
    place: { ...PLACE, label: 'Rosenthaler Platz', latitude: 52.5185, longitude: 13.4128 },
    sourceWindows: hostedWindows,
    revision: 1,
    status: 'collecting',
    audienceCount: 4,
    memberUids: [me.uid, max.uid, lisa.uid, jonas.uid],
    createdAt: ts(now - 5 * HOUR),
    updatedAt: ts(now - 20 * 60 * 1000),
    expireAt: ts(hostedExpire),
  };
  batch.set(db.doc(`timePlans/${hostedId}`), hostedPlan);
  const { memberUids: _hostedMembers, ...hostedProjection } = hostedPlan;
  batch.set(db.doc(`timePlanAudience/${hostedId}_${me.uid}`), {
    ...hostedProjection,
    planId: hostedId,
    audienceUid: me.uid,
    joined: true,
    memberCount: 4,
  });
  batch.set(
    db.doc(`timePlans/${hostedId}/timePlanMembers/${me.uid}`),
    memberDoc(
      me,
      'host',
      Object.fromEntries(hostedWindows.map((w) => [w.id, whole(w)])),
      hostedExpire,
    ),
  );
  batch.set(
    db.doc(`timePlans/${hostedId}/timePlanMembers/${max.uid}`),
    memberDoc(
      max,
      'member',
      {
        [hostedWindows[0].id]: part(hostedWindows[0], 60, 300),
        [hostedWindows[1].id]: whole(hostedWindows[1]),
      },
      hostedExpire,
    ),
  );
  batch.set(
    db.doc(`timePlans/${hostedId}/timePlanMembers/${lisa.uid}`),
    memberDoc(
      lisa,
      'member',
      {
        [hostedWindows[0].id]: part(hostedWindows[0], 60, 240),
        [hostedWindows[1].id]: whole(hostedWindows[1]),
      },
      hostedExpire,
    ),
  );
  // Jonas cannot make the evening at all — the one row that must read as
  // "kann nicht" rather than as a missing answer.
  batch.set(
    db.doc(`timePlans/${hostedId}/timePlanMembers/${jonas.uid}`),
    memberDoc(
      jonas,
      'member',
      {
        [hostedWindows[0].id]: [],
        [hostedWindows[1].id]: whole(hostedWindows[1]),
      },
      hostedExpire,
    ),
  );

  // ── 3. A round too big to list. Above ANSWER_LIST_LIMIT the card groups the
  // answers into patterns instead of drawing a row per person, and that path
  // only shows up with enough people to trip it.
  const crowdWindows = windowsFor('tpcrowd', [
    [2, 18, 23],
    [5, 10, 16],
  ]);
  const crowdExpire = Math.max(...crowdWindows.map((w) => Date.parse(w.endsAt))) + RETENTION_MS;
  const crowdId = 'timePlan_seed_crowd';
  const crowd = Array.from({ length: 17 }, (_, index) => ({
    uid: `seed-crowd-${index + 1}`,
    displayName: `Person ${index + 1}`,
    initials: `P${index + 1}`,
  }));
  const crowdPlan = {
    hostId: me.uid,
    hostName: me.displayName,
    hostInitials: me.initials,
    title: 'Sommerfest',
    place: { ...PLACE, label: 'Tempelhofer Feld', latitude: 52.5265, longitude: 13.3985 },
    sourceWindows: crowdWindows,
    revision: 1,
    status: 'collecting',
    audienceCount: crowd.length + 1,
    memberUids: [me.uid, ...crowd.map((person) => person.uid)],
    createdAt: ts(now - 3 * HOUR),
    updatedAt: ts(now - 10 * 60 * 1000),
    expireAt: ts(crowdExpire),
  };
  batch.set(db.doc(`timePlans/${crowdId}`), crowdPlan);
  const { memberUids: _crowdMembers, ...crowdProjection } = crowdPlan;
  batch.set(db.doc(`timePlanAudience/${crowdId}_${me.uid}`), {
    ...crowdProjection,
    planId: crowdId,
    audienceUid: me.uid,
    joined: true,
    memberCount: crowd.length + 1,
  });
  batch.set(
    db.doc(`timePlans/${crowdId}/timePlanMembers/${me.uid}`),
    memberDoc(
      me,
      'host',
      Object.fromEntries(crowdWindows.map((w) => [w.id, whole(w)])),
      crowdExpire,
    ),
  );
  // A deliberate spread: most can all evening, a block arrives late, a few
  // leave early, two cannot make it at all.
  crowd.forEach((person, index) => {
    const evening = crowdWindows[0];
    const day = crowdWindows[1];
    let first;
    if (index < 9) first = whole(evening);
    else if (index < 14) first = part(evening, 120, 300);
    else if (index < 15) first = part(evening, 0, 120);
    else first = [];
    batch.set(
      db.doc(`timePlans/${crowdId}/timePlanMembers/${person.uid}`),
      memberDoc(
        person,
        'member',
        {
          [evening.id]: first,
          [day.id]: index % 3 === 0 ? whole(day) : part(day, 60, 360),
        },
        crowdExpire,
      ),
    );
  });

  await batch.commit();
  console.log(`Terminfindungen angelegt für ${me.displayName} (${me.uid}):`);
  console.log(`  • ${invitedId} — du bist EINGELADEN (Antwortkarten, Postfach-Eintrag)`);
  console.log(`  • ${hostedId} — du bist HOST (Übersicht, Auffächern, Festlegen)`);
  console.log(`  • ${crowdId} — 18 Antworten, Übersicht fasst zusammen statt aufzulisten`);
  await app.delete();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
