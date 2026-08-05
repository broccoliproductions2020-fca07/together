async function cleanupExpiredSurfaces(db, cutoff) {
  const [
    expiredPresence,
    expiredActivities,
    expiredGroupOpenings,
    expiredRoundInvites,
    expiredRoundMemberships,
  ] = await Promise.all([
    db.collection('presence').where('expireAt', '<=', cutoff).limit(100).get(),
    db
      .collection('activities')
      .where('status', '==', 'active')
      .where('visibleUntil', '<=', cutoff)
      .limit(100)
      .get(),
    db.collection('groupOpenings').where('expireAt', '<=', cutoff).limit(100).get(),
    db.collection('spontaneousRoundInvites').where('expireAt', '<=', cutoff).limit(100).get(),
    db
      .collection('spontaneousRoundMemberships')
      .where('expireAt', '<=', cutoff)
      .limit(100)
      .get(),
  ]);

  const batch = db.batch();
  expiredPresence.docs.forEach((snapshot) => batch.delete(snapshot.ref));
  expiredActivities.docs.forEach((snapshot) => batch.update(snapshot.ref, { status: 'expired' }));
  expiredGroupOpenings.docs.forEach((snapshot) => batch.delete(snapshot.ref));
  expiredRoundInvites.docs.forEach((snapshot) => batch.delete(snapshot.ref));
  expiredRoundMemberships.docs.forEach((snapshot) => batch.delete(snapshot.ref));

  if (
    !expiredPresence.empty ||
    !expiredActivities.empty ||
    !expiredGroupOpenings.empty ||
    !expiredRoundInvites.empty ||
    !expiredRoundMemberships.empty
  ) {
    await batch.commit();
  }

  return {
    presence: expiredPresence.size,
    activities: expiredActivities.size,
    groupOpenings: expiredGroupOpenings.size,
    spontaneousRoundInvites: expiredRoundInvites.size,
    spontaneousRoundMemberships: expiredRoundMemberships.size,
  };
}

module.exports = { cleanupExpiredSurfaces };
