/**
 * Provided demo portraits for the LOCAL emulator suite.
 *
 * Twelve supplied files, six female and six male (the `w`/`m` in the delivered
 * filenames). The order below IS the delivery order (pb1..pb12); the names are
 * assigned by that order and by gender only — never by what a face looks like.
 *
 * The `dev` roster has grown past twelve people (16, for a spread-out set of
 * activities), so four background people — Ben, Felix, Lina, Marie — reuse an
 * existing portrait of the same gender rather than showing an initials circle.
 * Every reuse is picked so the two people never appear in the same activity at
 * once (Felix→David's face, Lina→Amelie's face, etc. — see the entries below),
 * so no single rendered screen ever shows one face twice. `seed-hannes` and
 * `seed-sebbo` exist only in the capture ("landing") world and reuse pb4/pb6
 * for the same reason. Each entry keeps its own `file` value so a uid can still
 * point at a real, uid-named file when a distinct photo is added later.
 *
 * This does NOT upload anything itself. It drives the app's own profile-picture
 * mechanism: it signs in as each demo person against the Auth emulator and calls
 * the same `updateOwnProfile` callable that `ProfileEditSheet` calls, with the
 * same `avatarBase64` payload. The function then owns everything that matters —
 * the object path (`avatars/{uid}/{avatarId}.jpg`), the download token, the URL,
 * the rate limit, and the fan-out of `avatarUrl` into `users`, `publicProfiles`
 * and `friendSearch`.
 *
 * A seed-only uploader was tried first and removed: it produced the same pixels
 * but its own path and token, i.e. a parallel implementation of something the
 * product already does. Seeds must write exactly the shapes the cloud functions
 * produce, so the seed calls the function instead of imitating it.
 *
 * The image is prepared the way the client prepares it (`prepareAvatar` in
 * `src/features/auth/components/ProfileEditSheet.tsx`): centre-cropped to a
 * square, resized to 512 px, JPEG at quality 82 — the server rejects anything
 * that is not a JPEG under 1 MB.
 *
 * The ONE local adaptation is the loopback host. The functions emulator builds
 * the URL from its own `FIREBASE_STORAGE_EMULATOR_HOST` (`127.0.0.1`), which is
 * the Android emulator's own loopback, not the host machine's — so the device
 * could not load it. Only the host part is rewritten to `10.0.2.2`; path, token
 * and query stay exactly as the function produced them.
 *
 * If a file is missing the seed does not fail and does not silently fall back to
 * something else: it reports the exact missing path and leaves `avatarUrl`
 * unset, so the app shows its normal initials circle.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const AVATAR_DIR = resolve(here, '..', '..', 'assets', 'demo-avatars');

/**
 * uid → source file. Filenames are the uid so the mapping cannot drift, and the
 * roster order documents which supplied portrait belongs to whom.
 */
export const DEMO_AVATARS = [
  // pb1 w
  { uid: 'seed-mia', file: 'seed-mia.png', note: 'Mia Sommer — der Aufnahme-Account' },
  // pb2 w
  { uid: 'seed-lisa', file: 'seed-lisa.png', note: 'Lisa Becker' },
  // pb3 w
  { uid: 'seed-amelie', file: 'seed-amelie.png', note: 'Amelie Wagner' },
  // pb4 m
  { uid: 'seed-max', file: 'seed-max.png', note: 'Max Krüger' },
  // pb5 m
  { uid: 'seed-david', file: 'seed-david.png', note: 'David Klein' },
  // pb6 m
  { uid: 'seed-elias', file: 'seed-elias.png', note: 'Elias Becker' },
  // pb7 w
  { uid: 'seed-nora', file: 'seed-nora.png', note: 'Nora Weiß' },
  // pb8 m
  { uid: 'seed-jonas', file: 'seed-jonas.png', note: 'Jonas Pohl' },
  // pb9 w
  { uid: 'seed-hannah', file: 'seed-hannah.png', note: 'Hannah Vogel' },
  // pb10 m
  { uid: 'seed-tom', file: 'seed-tom.png', note: 'Tom Richter' },
  // pb11 w
  { uid: 'seed-sofia', file: 'seed-sofia.png', note: 'Sofia Neumann' },
  // pb12 m
  { uid: 'seed-noah', file: 'seed-noah.png', note: 'Noah Fischer' },
  // pb8 m, wiederverwendet — Ben taucht in keiner Activity neben Jonas auf
  { uid: 'seed-ben', file: 'seed-jonas.png', note: 'Ben Otto (Gesicht von Jonas)' },
  // pb5 m, wiederverwendet — Felix (Picknick) und David (Lauf) treffen nie aufeinander
  { uid: 'seed-felix', file: 'seed-david.png', note: 'Felix Brandt (Gesicht von David)' },
  // pb3 w, wiederverwendet — Lina (Kino) und Amelie (Brunch) treffen nie aufeinander
  { uid: 'seed-lina', file: 'seed-amelie.png', note: 'Lina Roth (Gesicht von Amelie)' },
  // pb9 w, wiederverwendet — Marie ist in keiner Activity neben Hannah
  { uid: 'seed-marie', file: 'seed-hannah.png', note: 'Marie Schulz (Gesicht von Hannah)' },
  // pb4 m — Aufnahme-Welt, gleiche Datei wie seed-max
  { uid: 'seed-hannes', file: 'seed-hannes.png', note: 'Hannes Macha (nur landing)' },
  // pb6 m — Aufnahme-Welt, gleiche Datei wie seed-elias
  { uid: 'seed-sebbo', file: 'seed-sebbo.png', note: 'Sebbo Regs (nur landing)' },
];

/** Bucket used by the local Storage emulator. Never a real project bucket. */
export const DEMO_BUCKET = 'demo-together.appspot.com';

/** Mirrors AVATAR_SIZE and the JPEG quality in ProfileEditSheet. */
const AVATAR_SIZE = 512;
const AVATAR_QUALITY = 82;

const FUNCTIONS_REGION = 'europe-west3';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';

/**
 * The Android emulator reaches the host machine through 10.0.2.2. Override with
 * EMULATOR_LOOPBACK_HOST for a physical device on the LAN.
 */
const DEVICE_LOOPBACK = process.env.EMULATOR_LOOPBACK_HOST ?? '10.0.2.2';

/** Rewrites only the host of a storage-emulator URL; everything else is kept. */
export function reachableFromDevice(url) {
  if (typeof url !== 'string') return url;
  return url.replace(
    /^http:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(?=[:/])/,
    `http://${DEVICE_LOOPBACK}`,
  );
}

/** Centre-crop to a square, resize to 512, encode JPEG — same as the client. */
async function prepareAvatarJpeg(source) {
  const { default: sharp } = await import('sharp');
  const image = sharp(readFileSync(source));
  const { width = 0, height = 0 } = await image.metadata();
  const side = Math.min(width, height);
  if (side <= 0) throw new Error(`Kein lesbares Bild: ${source}`);
  return image
    .extract({
      left: Math.max(0, Math.floor((width - side) / 2)),
      top: Math.max(0, Math.floor((height - side) / 2)),
      width: side,
      height: side,
    })
    .resize(AVATAR_SIZE, AVATAR_SIZE)
    .jpeg({ quality: AVATAR_QUALITY })
    .toBuffer();
}

/** Auth emulator: custom token to ID token. No password needed. */
async function idTokenFor(app, uid) {
  const customToken = await app.auth().createCustomToken(uid);
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.idToken) {
    throw new Error(`Anmeldung im Auth-Emulator fehlgeschlagen (${uid}): ${JSON.stringify(body)}`);
  }
  return body.idToken;
}

/** Calls the real callable exactly as the app does. */
async function callUpdateOwnProfile(projectId, idToken, data) {
  const response = await fetch(
    `http://${FUNCTIONS_HOST}/${projectId}/${FUNCTIONS_REGION}/updateOwnProfile`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ data }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`updateOwnProfile: ${body?.error?.message ?? `HTTP ${response.status}`}`);
  }
  return body.result ?? {};
}

/**
 * Runs the app's own avatar flow for every present portrait.
 *
 * Must be called AFTER `users/{uid}` and `publicProfiles/{uid}` exist with a
 * display name and a username — the callable rejects an unfinished profile with
 * `failed-precondition`, exactly as it would for a half-provisioned real account.
 *
 * Idempotent: a person who already carries an `avatarUrl` is skipped, so
 * re-seeding does not burn the server's five-avatar-changes-per-day budget.
 *
 * @param {{ auth: () => any, firestore: () => any }} app initialized admin app
 * @param {{ projectId: string, displayNames: Map<string,string>, force?: boolean }} options
 * @returns {Promise<{ urls: Map<string,string>, missing: string[], reused: number }>}
 */
export async function applyDemoAvatars(app, { projectId, displayNames, force = false }) {
  const db = app.firestore();
  const urls = new Map();
  const missing = [];
  let reused = 0;

  for (const entry of DEMO_AVATARS) {
    // The list spans both worlds; a uid the current scenario does not contain
    // has no account to sign in as after a reset.
    if (!displayNames.has(entry.uid)) continue;
    const source = join(AVATAR_DIR, entry.file);
    if (!existsSync(source)) {
      missing.push(source);
      continue;
    }

    // Firestore first, then the Auth user's photoURL. The second one matters
    // after a full reset: the seed wipes Firestore but keeps the roster's auth
    // users, so the URL the function produced is still there. Without this
    // fallback every reset would re-upload twelve portraits and burn the
    // server's five-changes-per-day budget after the fourth run of the day.
    const existing =
      (await db.doc(`users/${entry.uid}`).get()).data()?.avatarUrl ??
      (
        await app
          .auth()
          .getUser(entry.uid)
          .catch(() => null)
      )?.photoURL;
    if (!force && typeof existing === 'string' && existing) {
      urls.set(entry.uid, reachableFromDevice(existing));
      reused += 1;
      continue;
    }

    const displayName = displayNames.get(entry.uid);
    if (!displayName) throw new Error(`Kein Anzeigename für ${entry.uid} übergeben.`);

    const avatarBase64 = (await prepareAvatarJpeg(source)).toString('base64');
    const result = await callUpdateOwnProfile(projectId, await idTokenFor(app, entry.uid), {
      displayName,
      avatarBase64,
    });
    if (typeof result.avatarUrl !== 'string' || !result.avatarUrl) {
      throw new Error(`updateOwnProfile lieferte keine avatarUrl für ${entry.uid}.`);
    }
    urls.set(entry.uid, reachableFromDevice(result.avatarUrl));
  }

  // The function wrote the URL with its own loopback host. Point the three
  // identity documents at the address the device can actually reach.
  if (urls.size > 0) {
    const batch = db.batch();
    for (const [uid, url] of urls) {
      for (const path of [`users/${uid}`, `publicProfiles/${uid}`, `friendSearch/${uid}`]) {
        batch.set(db.doc(path), { avatarUrl: url }, { merge: true });
      }
    }
    await batch.commit();
    await Promise.all(
      [...urls].map(([uid, photoURL]) =>
        app
          .auth()
          .updateUser(uid, { photoURL })
          .catch(() => {}),
      ),
    );
  }

  if (missing.length > 0) {
    console.warn(
      `\n⚠ ${missing.length} von ${DEMO_AVATARS.length} Demo-Portraits fehlen. Ohne sie zeigt die App ihre normalen Initialen-Kreise.\n` +
        `  Lege die Dateien hier ab und starte den Seed erneut:\n` +
        missing.map((file) => `    ${file}`).join('\n') +
        `\n  Siehe assets/demo-avatars/README.md.\n`,
    );
  }

  return { urls, missing, reused };
}

/** Spreads `avatarUrl` into an identity snapshot only when a portrait exists. */
export const withAvatar = (urls, uid) => {
  const url = urls.get(uid);
  return url ? { avatarUrl: url } : {};
};
