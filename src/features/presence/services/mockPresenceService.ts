import type {
  PresenceActor,
  PresenceDoc,
  PresenceInput,
  PresenceService,
} from './presenceService.types';

/**
 * In-memory presence. On a single mock device the only doc is your own, so
 * `subscribeOpenFriends` (which excludes yourself) is typically empty — the mock
 * nearby list stays driven by mockNearbyFriends. This exists so your own open
 * status round-trips through the same seam as firebase mode.
 */

interface Sub {
  actor: PresenceActor;
  cb: (docs: PresenceDoc[]) => void;
}

const docs = new Map<string, PresenceDoc>();
const subs = new Set<Sub>();

function listFor(actor: PresenceActor): PresenceDoc[] {
  const now = Date.now();
  return [...docs.values()].filter(
    (doc) =>
      doc.uid !== actor.uid && doc.expiresAt > now && doc.audienceUids.includes(actor.uid),
  );
}

function emit() {
  subs.forEach((sub) => sub.cb(listFor(sub.actor)));
}

export const mockPresenceService: PresenceService = {
  subscribeOpenFriends(actor, cb) {
    const sub: Sub = { actor, cb };
    subs.add(sub);
    cb(listFor(actor));
    return () => {
      subs.delete(sub);
    };
  },

  setPresence(actor, input: PresenceInput) {
    docs.set(actor.uid, {
      uid: actor.uid,
      displayName: actor.displayName,
      initials: actor.initials,
      avatarUrl: actor.avatarUrl,
      vibe: input.vibe ?? undefined,
      expiresAt: input.expiresAt,
      shareLocation: input.shareLocation,
      coarseLocation: input.shareLocation ? (input.coarseLocation ?? undefined) : undefined,
      audienceUids: input.audienceUids,
      updatedAt: Date.now(),
    });
    emit();
  },

  clearPresence(actor) {
    docs.delete(actor.uid);
    emit();
  },
};
