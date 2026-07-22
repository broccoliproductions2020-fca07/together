import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
} from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';

import { getFirebaseDb, getFirebaseFunctions } from '@/shared/services/firebase';

import type { ChatMessage, ChatRoom, GroupOpening } from '../types';
import type {
  ChatActor,
  ChatService,
  GroupMember,
  RoomMemberProfile,
  Unsubscribe,
} from './chatService.types';
import { loadCachedMessages, MAX_CACHED_MESSAGES, saveCachedMessages } from './messageCache';

/**
 * Firestore implementation of {@link ChatService} (emulator in dev, cloud later).
 *
 * Cost discipline (AGENTS.md):
 *  - room summaries use a per-device cache + one-off foreground sync; their
 *    listener exists only while the visible activity list is open. Messages
 *    stream only for the open room, capped at 50.
 *  - Rooms/messages carry `expireAt` → Firestore TTL deletes them (activity
 *    chats 12 h after end, groups 30 d after last activity). Nothing is
 *    client-deletable (rules).
 */

const MESSAGE_LIMIT = 50;
/** Blanket message TTL — the room's own expireAt is the user-facing rule. */

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number') return value;
  return Date.now();
}

function mapRoom(id: string, data: DocumentData): ChatRoom {
  return {
    id,
    type: data.type === 'group' ? 'group' : 'activity',
    title: data.title,
    vibe: data.vibe,
    memberIds: data.memberIds ?? [],
    ...(Array.isArray(data.adminUids) ? { adminUids: data.adminUids } : {}),
    ...(data.joinable === true ? { joinable: true } : {}),
    lastMessage: data.lastMessage
      ? { ...data.lastMessage, at: toMillis(data.lastMessage.at) }
      : undefined,
    messageCount: data.messageCount ?? 0,
    readCount: data.readCount ?? {},
    createdAt: toMillis(data.createdAt),
    expireAt: data.expireAt ? toMillis(data.expireAt) : undefined,
  };
}

function mapMessage(actor: ChatActor, id: string, roomId: string, data: DocumentData): ChatMessage {
  return {
    id,
    activityId: roomId,
    authorId: data.authorId,
    authorName: data.authorName ?? '?',
    initials: data.initials ?? '?',
    text: data.text ?? '',
    createdAt: toMillis(data.createdAt),
    isMe: data.authorId === actor.uid,
    kind: data.kind === 'proposal' ? 'proposal' : 'text',
    proposal: data.proposal,
  };
}

function roomRef(roomId: string) {
  return doc(getFirebaseDb(), 'chats', roomId);
}

function messagesRef(roomId: string) {
  return collection(getFirebaseDb(), 'chats', roomId, 'messages');
}

function roomsQuery(actor: ChatActor) {
  return query(
    collection(getFirebaseDb(), 'chats'),
    where('memberIds', 'array-contains', actor.uid),
    where('expireAt', '>', Timestamp.fromMillis(Date.now())),
    // The range field must be the first Firestore ordering.
    orderBy('expireAt', 'asc'),
    orderBy('createdAt', 'desc'),
    limit(30),
  );
}

function mapRooms(docs: { id: string; data: () => DocumentData }[]): ChatRoom[] {
  return docs
    .map((item) => mapRoom(item.id, item.data()))
    // The UI stays newest-first; expireAt only leads the bounded query.
    .sort((first, second) => second.createdAt - first.createdAt);
}

async function writeMessage(
  actor: ChatActor,
  roomId: string,
  text: string,
  extra: Record<string, unknown> = {},
) {
  // One atomic batch instead of two sequential round-trips — also avoids the
  // room summary (lastMessage/messageCount) ever drifting out of sync with
  // the message itself if one of the two writes were to fail independently.
  if (extra.kind === 'proposal') {
    const sendProposal = httpsCallable(getFirebaseFunctions(), 'sendChatProposal');
    const proposal = (extra.proposal ?? {}) as { what?: string; when?: string; where?: string };
    await sendProposal({
      roomId,
      text,
      authorName: actor.displayName,
      initials: actor.initials,
      ...proposal,
    });
    return;
  }

  const sendMessage = httpsCallable(getFirebaseFunctions(), 'sendChatMessage');
  await sendMessage({
    roomId,
    text,
    authorName: actor.displayName,
    initials: actor.initials,
  });
}

export const firebaseChatService: ChatService = {
  async getRooms(actor) {
    const snapshot = await getDocs(roomsQuery(actor));
    return mapRooms(snapshot.docs);
  },

  subscribeRooms(actor, cb) {
    return onSnapshot(
      roomsQuery(actor),
      (snapshot) => cb(mapRooms(snapshot.docs)),
      (error) => console.warn('[chat] Raumliste konnte nicht aktualisiert werden:', error),
    );
  },

  async getRoom(actor, roomId) {
    const snapshot = await getDoc(roomRef(roomId));
    if (!snapshot.exists()) return undefined;
    const room = mapRoom(snapshot.id, snapshot.data());
    if (!room.memberIds.includes(actor.uid) || (room.expireAt && room.expireAt <= Date.now())) {
      return undefined;
    }
    return room;
  },

  subscribeMessages(actor, roomId, cb) {
    // Incremental sync: cached messages paint instantly and are never re-read
    // from the server. First-ever open fetches the newest MESSAGE_LIMIT; every
    // later open anchors the listener at the newest cached message
    // (`createdAt >`), so each message is downloaded exactly ONCE per device.
    // Known tradeoffs: (a) edits to already-cached docs (proposal toggles by
    // others) don't re-stream — own toggles still work, and expiry is enforced
    // by the room gate + cache pruning; (b) if > MESSAGE_LIMIT messages arrived
    // since the last open, the overflow only appears on the next open.
    let cancelled = false;
    let detach: Unsubscribe = () => {};
    void loadCachedMessages(roomId).then((cached) => {
      if (cancelled) return;
      let known = cached.map((m) => ({ ...m, isMe: m.authorId === actor.uid }));
      if (known.length) cb([...known]);

      const newestTs = known.length ? known[known.length - 1].createdAt : 0;
      const q = newestTs
        ? query(
            messagesRef(roomId),
            where('createdAt', '>', Timestamp.fromMillis(newestTs)),
            orderBy('createdAt', 'asc'),
            limit(MESSAGE_LIMIT),
          )
        : query(messagesRef(roomId), orderBy('createdAt', 'desc'), limit(MESSAGE_LIMIT));

      detach = onSnapshot(
        q,
        (snapshot) => {
          const incoming = snapshot.docs.map((d) => mapMessage(actor, d.id, roomId, d.data()));
          if (!newestTs) incoming.reverse();
          const byId = new Map(known.map((m) => [m.id, m]));
          incoming.forEach((m) => byId.set(m.id, m));
          known = [...byId.values()]
            .sort((a, b) => a.createdAt - b.createdAt)
            .slice(-MAX_CACHED_MESSAGES);
          cb([...known]);
          saveCachedMessages(roomId, known);
        },
        (error) => {
          // Keep the locally known messages (or the room-summary preview in
          // ChatProvider) visible when a listener cannot be established.
          // Silently replacing them with an empty thread made sent messages
          // appear to vanish while the room summary still showed them.
          console.warn('[chat] Nachrichten konnten nicht geladen werden:', error);
          cb([...known]);
        },
      );
    });
    return () => {
      cancelled = true;
      detach();
    };
  },

  async joinActivity(actor, activity) {
    const joinRoom = httpsCallable(getFirebaseFunctions(), 'joinChatRoom');
    await joinRoom({ roomId: activity.id });
  },

  async leaveRoom(actor, roomId) {
    const leaveRoom = httpsCallable(getFirebaseFunctions(), 'leaveChatRoom');
    await leaveRoom({ roomId });
  },

  async createGroup(actor, members: GroupMember[], vibe) {
    const names = members.map((m) => m.displayName);
    const createGroup = httpsCallable<
      { memberUids: string[]; title: string; vibe?: string },
      { ok: true; id: string }
    >(getFirebaseFunctions(), 'createGroupChat');
    const result = await createGroup({
      memberUids: members.map((member) => member.id),
      title:
        vibe?.trim() || (names.length ? `Mit ${names.slice(0, 3).join(', ')}` : 'Neue Planung'),
      ...(vibe?.trim() ? { vibe: vibe.trim() } : {}),
    });
    return result.data.id;
  },

  async sendMessage(actor, roomId, text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    await writeMessage(actor, roomId, trimmed);
  },

  async sendProposal(actor, roomId, data) {
    await writeMessage(actor, roomId, data.what ?? 'Vorschlag', {
      kind: 'proposal',
      proposal: {
        ...(data.what ? { what: data.what } : {}),
        ...(data.when ? { when: data.when } : {}),
        ...(data.where ? { where: data.where } : {}),
        confirmedBy: [actor.uid],
      },
    });
  },

  async toggleProposalConfirm(actor, roomId, messageId, alreadyConfirmed) {
    await updateDoc(doc(messagesRef(roomId), messageId), {
      'proposal.confirmedBy': alreadyConfirmed ? arrayRemove(actor.uid) : arrayUnion(actor.uid),
    });
  },

  async markProposalPlanned(_actor, roomId, messageId) {
    await updateDoc(doc(messagesRef(roomId), messageId), { 'proposal.planned': true });
  },

  async markRead(actor, roomId, seenCount) {
    await updateDoc(roomRef(roomId), { [`readCount.${actor.uid}`]: seenCount });
  },

  async getRoomMembers(_actor, roomId) {
    // On-demand one-off reads (≤ room size, only when the info sheet opens) —
    // deliberately NOT a listener (cost discipline, AGENTS.md).
    const result = await httpsCallable<{ roomId: string }, { members: RoomMemberProfile[] }>(
      getFirebaseFunctions(),
      'getRoomMemberProfiles',
    )({ roomId });
    return result.data.members;
  },

  async removeMember(_actor, roomId, memberUid) {
    await httpsCallable(getFirebaseFunctions(), 'removeChatMember')({ roomId, memberUid });
  },

  async promoteAdmin(_actor, roomId, memberUid) {
    await httpsCallable(getFirebaseFunctions(), 'promoteChatAdmin')({ roomId, memberUid });
  },

  async renameRoom(_actor, roomId, title) {
    await httpsCallable(getFirebaseFunctions(), 'renameChatRoom')({ roomId, title });
  },

  subscribeGroupOpenings(actor, cb) {
    const q = query(
      collection(getFirebaseDb(), 'groupOpenings'),
      where('audienceUids', 'array-contains', actor.uid),
      limit(20),
    );
    return onSnapshot(
      q,
      (snapshot) => {
        cb(
          snapshot.docs.map((d): GroupOpening => {
            const data = d.data();
            return {
              id: d.id,
              title: typeof data.title === 'string' ? data.title : 'Planung',
              ...(typeof data.vibe === 'string' ? { vibe: data.vibe } : {}),
              memberCount: typeof data.memberCount === 'number' ? data.memberCount : 0,
              memberPreview: Array.isArray(data.memberPreview) ? data.memberPreview : [],
            };
          }),
        );
      },
      () => cb([]),
    );
  },

  async setGroupOpen(_actor, roomId, open) {
    await httpsCallable(getFirebaseFunctions(), 'setGroupJoinable')({ roomId, joinable: open });
  },

  async joinOpenGroup(_actor, roomId) {
    await httpsCallable(getFirebaseFunctions(), 'joinOpenGroup')({ roomId });
  },
};
