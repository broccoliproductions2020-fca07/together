/**
 * Räumt die lokale Emulator Suite von allem auf, was ein FRÜHERER Seed-Lauf
 * hinterlassen hat, bevor der nächste schreibt.
 *
 * Warum das nötig ist: Die Seeds sind idempotent — sie überschreiben ihre
 * eigenen Dokumente. Was sie NICHT können, ist ein Dokument entfernen, das sie
 * diesmal gar nicht mehr schreiben. Wechselt man vom Entwickler- auf den
 * Marketing-Datensatz, bleiben sonst die Aktivitäten, Einladungen und Personen
 * des anderen Szenarios stehen: eine vierte Stecknadel auf der Karte, ein
 * Anfrage-Badge in der Top-Bar, fremde Gesichter in der Offen-Liste. Genau die
 * Dinge, die man auf einem Werbebild erst sieht, wenn es zu spät ist.
 *
 * Der Alternativweg wäre, die Emulatoren neu zu starten (sie starten leer).
 * Das dauert rund eine Minute und wirft den angemeldeten Account raus — für
 * eine Aufnahmesitzung, in der man den Datensatz mehrfach dreht, zu teuer.
 *
 * Bewusst NICHT gelöscht werden die Identitäten, die auch im neuen Datensatz
 * vorkommen. Ihre `avatarUrl` hängt an einem echten Upload durch
 * `updateOwnProfile`, und der Server erlaubt nur fünf Bildwechsel pro Tag und
 * Person. Wer bleibt, behält sein Portrait.
 */

/** Alle Dokument-IDs einer Collection, die mit `seed-` beginnen. */
async function seedDocIds(db, collection, FieldPath) {
  const snapshot = await db
    .collection(collection)
    .orderBy(FieldPath.documentId())
    .startAt('seed-')
    .endAt('seed-\uf8ff')
    .get();
  return snapshot.docs.map((doc) => doc.id);
}

async function deleteWithSubcollections(ref) {
  const subcollections = await ref.listCollections();
  for (const sub of subcollections) {
    const docs = await sub.listDocuments();
    await Promise.all(docs.map((doc) => deleteWithSubcollections(doc)));
  }
  await ref.delete().catch(() => {});
}

/**
 * @param {import('firebase-admin').app.App} app
 * @param {{
 *   FieldPath: any,
 *   keepUids: Set<string>,
 *   keepActivityIds: Set<string>,
 *   auth: any,
 * }} options
 * @returns {Promise<{people: number, activities: number, other: number}>}
 */
export async function purgeStaleSeeds(app, { FieldPath, keepUids, keepActivityIds, rtdb }) {
  const db = app.firestore();
  const auth = app.auth();
  const report = { people: 0, activities: 0, other: 0, live: 0 };

  // ── Personen, die im neuen Datensatz nicht mehr vorkommen ────────────────
  const { users } = await auth.listUsers(1000);
  const staleUids = users
    .map((user) => user.uid)
    .filter((uid) => uid.startsWith('seed-') && !keepUids.has(uid));

  for (const uid of staleUids) {
    const userDoc = await db.doc(`users/${uid}`).get();
    const username = userDoc.data()?.username;
    await Promise.all([
      deleteWithSubcollections(db.doc(`users/${uid}`)),
      db
        .doc(`publicProfiles/${uid}`)
        .delete()
        .catch(() => {}),
      db
        .doc(`friendSearch/${uid}`)
        .delete()
        .catch(() => {}),
      db
        .doc(`presence/${uid}`)
        .delete()
        .catch(() => {}),
      db
        .doc(`spontaneousRoundMemberships/${uid}`)
        .delete()
        .catch(() => {}),
      username
        ? db
            .doc(`usernames/${username}`)
            .delete()
            .catch(() => {})
        : Promise.resolve(),
      auth.deleteUser(uid).catch(() => {}),
    ]);
    report.people += 1;
  }

  // Freundschaften, an denen eine entfernte Person beteiligt war. Die IDs sind
  // `${a}__${b}`, also reicht ein Namensvergleich — kein Query nötig.
  if (staleUids.length > 0) {
    const stale = new Set(staleUids);
    const friendships = await db.collection('friendships').listDocuments();
    await Promise.all(
      friendships
        .filter((ref) => ref.id.split('__').some((uid) => stale.has(uid)))
        .map((ref) => ref.delete().catch(() => {})),
    );
  }

  // ── Aktivitäten (samt Chat) aus einem anderen Datensatz ──────────────────
  for (const id of await seedDocIds(db, 'activities', FieldPath)) {
    if (keepActivityIds.has(id)) continue;
    await deleteWithSubcollections(db.doc(`activities/${id}`));
    await deleteWithSubcollections(db.doc(`chats/${id}`));
    report.activities += 1;
  }

  // ── Alles, was der nächste Lauf ohnehin neu schreibt, wenn er es will ────
  // Diese Sammlungen tragen ausschließlich Fixtures. Was das neue Szenario
  // braucht, legt es gleich danach wieder an; was es nicht braucht, ist Rauschen.
  for (const collection of [
    'notifications',
    'groupOpenings',
    'spontaneousRoundInvites',
    'groupChatInvites',
    'timePlans',
    'timePlanAudience',
  ]) {
    for (const id of await seedDocIds(db, collection, FieldPath)) {
      await deleteWithSubcollections(db.doc(`${collection}/${id}`));
      report.other += 1;
    }
  }

  // Gruppenräume: Aktivitäts-Chats hängen oben schon an ihrer Aktivität, hier
  // bleiben nur die freistehenden Planungsrunden übrig.
  for (const id of await seedDocIds(db, 'chats', FieldPath)) {
    if (keepActivityIds.has(id)) continue;
    await deleteWithSubcollections(db.doc(`chats/${id}`));
    report.other += 1;
  }

  // ── Live-Zustände in der RTDB ────────────────────────────────────────────
  // Anreise und Heimweg werden von eigenen Seeds geschrieben und sind der
  // Grund, warum die Aufnahme-Welt in Varianten kommt: Eine stehengebliebene
  // Session pulsiert auf JEDER Fläche weiter (Schild-Ring, Safety-Pille) und
  // wäre damit auf dem Karten-Screenshot zu sehen, den sie nicht betrifft.
  // Die Varianten legen sie danach neu an.
  if (rtdb) {
    const removals = {};
    for (const [path, isSeed] of [
      ['heimwege', (key) => key.startsWith('seed-')],
      ['heimwegeIndex', (key) => key.startsWith('seed-')],
      ['journeys', (key) => key.startsWith('seed-')],
    ]) {
      const snapshot = await rtdb.ref(path).get();
      for (const key of Object.keys(snapshot.val() ?? {})) {
        if (!isSeed(key)) continue;
        removals[`${path}/${key}`] = null;
        report.live += 1;
      }
    }
    if (Object.keys(removals).length > 0) await rtdb.ref().update(removals);
  }

  return report;
}

/* ─────────────────────────────────────────────────────── voller Reset ── */

/**
 * Loescht ALLES und stellt damit sicher, dass zwei Laeufe denselben Stand
 * ergeben — die Bedingung dafuer, dass Renderings vergleichbar sind.
 *
 * `purgeStaleSeeds` (oben) raeumt chirurgisch auf und fasst nur `seed-*` an.
 * Das ist fuer den Entwickler-Seed richtig, fuer die Aufnahme-Welt aber zu
 * wenig: Ein Account aus einem frueheren Lauf, eine von der App selbst
 * geschriebene Benachrichtigung, eine per Hand angelegte Aktivitaet — nichts
 * davon traegt ein `seed-`-Praefix, und alles davon steht danach im Bild.
 *
 * Bewusst NICHT geloescht werden zwei Dinge:
 *
 * 1. **Die Auth-Konten des Rosters.** An ihnen haengt die `photoURL`, die die
 *    Function beim Portrait-Upload gesetzt hat. Loescht man sie, muss jeder
 *    Reset zwoelf Bilder neu hochladen — und der Server erlaubt fuenf
 *    Bildwechsel pro Person und Tag.
 * 2. **Der Storage-Bucket.** Aus demselben Grund: Die Dateien sind Eingabe,
 *    nicht Zustand.
 *
 * Jedes andere Auth-Konto verschwindet, auch ein eigenes Testkonto. Das ist
 * der Preis fuer Determinismus und gilt ausschliesslich fuer das
 * Landing-Szenario.
 */
export async function resetWorld(app, { keepUids }) {
  const db = app.firestore();
  const auth = app.auth();
  const report = { collections: 0, documents: 0, accounts: 0 };

  const collections = await db.listCollections();
  for (const collection of collections) {
    const docs = await collection.listDocuments();
    for (const doc of docs) {
      await deleteWithSubcollections(doc);
      report.documents += 1;
    }
    report.collections += 1;
  }

  // Ein einzelner Aufruf: Anreise und Heimweg leben beide hier, und ein
  // stehengebliebener Live-Punkt pulsiert auf jeder Flaeche weiter.
  await app.database().ref().set(null);

  const { users } = await auth.listUsers(1000);
  for (const user of users) {
    if (keepUids.has(user.uid)) continue;
    await auth.deleteUser(user.uid).catch(() => {});
    report.accounts += 1;
  }

  return report;
}
