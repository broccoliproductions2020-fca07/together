import { mockUsers } from '@/data/mock';

import type {
  FriendProfile,
  FriendRequestTarget,
  FriendService,
  FriendSettings,
  FriendshipDoc,
  SendFriendRequestResult,
} from './friendService.types';

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

function profileFor(uid: string, fallbackName = uid): FriendProfile {
  const user = mockUsers.find((item) => item.id === uid);
  const displayName = user?.displayName ?? user?.name ?? fallbackName;
  return {
    uid,
    displayName,
    initials: initialsOf(displayName),
    username: (user?.name ?? fallbackName).toLowerCase(),
  };
}

function contactFor(uid: string, fallbackName = uid): FriendProfile {
  const profile = profileFor(uid, fallbackName);
  return { uid: profile.uid, displayName: profile.displayName, initials: profile.initials };
}

function relationshipId(firstUid: string, secondUid: string) {
  return [firstUid, secondUid].sort().join('__');
}

const relationships = new Map<string, FriendshipDoc>();
const settingsByActor = new Map<string, FriendSettings>();
const settingsSubscribers = new Map<string, Set<(settings: FriendSettings) => void>>();

function settingsFor(actorUid: string): FriendSettings {
  const existing = settingsByActor.get(actorUid);
  if (existing) return existing;
  const initial: FriendSettings = {
    closeFriendUids: [],
    friendRequestPolicy: 'anyone',
    friendshipsVersion: 0,
    journeyRemindersEnabled: true,
  };
  settingsByActor.set(actorUid, initial);
  return initial;
}

function seedFor(actorUid: string) {
  if ([...relationships.values()].some((doc) => doc.participantUids.includes(actorUid))) return;
  mockUsers.slice(0, 7).forEach((user, index) => {
    const id = relationshipId(actorUid, user.id);
    relationships.set(id, {
      id,
      participantUids: [actorUid, user.id].sort(),
      requesterUid: actorUid,
      status: 'accepted',
      profiles: [profileFor(actorUid, 'Du'), profileFor(user.id)],
      createdAt: Date.now() - (index + 1) * 60_000,
      updatedAt: Date.now() - (index + 1) * 60_000,
    });
  });
}

function emitSettings(actorUid: string) {
  const settings = settingsFor(actorUid);
  settingsSubscribers.get(actorUid)?.forEach((cb) => cb(settings));
}

function bumpFriendshipVersions(uids: string[]) {
  [...new Set(uids)].forEach((uid) => {
    const settings = settingsFor(uid);
    settingsByActor.set(uid, {
      ...settings,
      friendshipsVersion: settings.friendshipsVersion + 1,
    });
    emitSettings(uid);
  });
}

export const mockFriendService: FriendService = {
  async listFriendships(actor) {
    seedFor(actor.uid);
    return [...relationships.values()]
      .filter((doc) => doc.participantUids.includes(actor.uid))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  subscribeSettings(actor, cb) {
    const subscribers =
      settingsSubscribers.get(actor.uid) ?? new Set<(settings: FriendSettings) => void>();
    subscribers.add(cb);
    settingsSubscribers.set(actor.uid, subscribers);
    cb(settingsFor(actor.uid));
    return () => subscribers.delete(cb);
  },

  async sendFriendRequest(actor, target: FriendRequestTarget): Promise<SendFriendRequestResult> {
    const user =
      target.kind === 'username'
        ? mockUsers.find(
            (item) =>
              item.name.toLowerCase() === target.username.trim().replace(/^@/, '').toLowerCase(),
          )
        : mockUsers.find((item) => item.id === target.targetUid);
    if (!user) throw new Error('Diese Person wurde nicht gefunden.');
    if (user.id === actor.uid) throw new Error('Du kannst dich nicht selbst hinzufügen.');
    const policy = settingsFor(user.id).friendRequestPolicy;
    if (policy === 'nobody') throw new Error('Diese Person nimmt keine Freundschaftsanfragen an.');
    if (policy === 'shared_activity' && target.kind !== 'shared_activity') {
      throw new Error('Freundschaftsanfragen sind nur nach einer gemeinsamen Activity möglich.');
    }
    const id = relationshipId(actor.uid, user.id);
    const existing = relationships.get(id);
    const friend = contactFor(user.id);
    if (existing?.status === 'accepted') return { state: 'already_friends', friend };
    if (existing?.status === 'pending' && existing.requesterUid !== actor.uid) {
      return { state: 'incoming_request', friend };
    }
    relationships.set(id, {
      id,
      participantUids: [actor.uid, user.id].sort(),
      requesterUid: actor.uid,
      status: 'pending',
      profiles: [contactFor(actor.uid, actor.displayName), friend],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    bumpFriendshipVersions([actor.uid, user.id]);
    return { state: 'sent', friend };
  },

  async respondToFriendRequest(actor, friendshipId, accept) {
    const existing = relationships.get(friendshipId);
    if (
      !existing ||
      existing.requesterUid === actor.uid ||
      !existing.participantUids.includes(actor.uid)
    )
      return;
    if (accept) {
      const otherUid = existing.participantUids.find((uid) => uid !== actor.uid) ?? 'friend';
      relationships.set(friendshipId, {
        ...existing,
        status: 'accepted',
        profiles: [profileFor(actor.uid, actor.displayName), profileFor(otherUid)],
        updatedAt: Date.now(),
      });
    } else relationships.delete(friendshipId);
    bumpFriendshipVersions(existing.participantUids);
  },

  async removeFriend(actor, uid) {
    relationships.delete(relationshipId(actor.uid, uid));
    const settings = settingsFor(actor.uid);
    settingsByActor.set(actor.uid, {
      ...settings,
      closeFriendUids: settings.closeFriendUids.filter((item) => item !== uid),
    });
    bumpFriendshipVersions([actor.uid, uid]);
    emitSettings(actor.uid);
  },

  async setCloseFriend(actor, uid, isClose) {
    const relation = relationships.get(relationshipId(actor.uid, uid));
    if (relation?.status !== 'accepted')
      throw new Error('Diese Person ist kein bestätigter Freund.');
    const settings = settingsFor(actor.uid);
    const values = new Set(settings.closeFriendUids);
    if (isClose) values.add(uid);
    else values.delete(uid);
    settingsByActor.set(actor.uid, { ...settings, closeFriendUids: [...values] });
    emitSettings(actor.uid);
  },

  async setFriendRequestPolicy(actor, policy) {
    const settings = settingsFor(actor.uid);
    settingsByActor.set(actor.uid, { ...settings, friendRequestPolicy: policy });
    emitSettings(actor.uid);
  },

  async setJourneyRemindersEnabled(actor, enabled) {
    const settings = settingsFor(actor.uid);
    settingsByActor.set(actor.uid, { ...settings, journeyRemindersEnabled: enabled });
    emitSettings(actor.uid);
  },
};
