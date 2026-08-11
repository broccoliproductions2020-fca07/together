import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
} from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';

import { getFirebaseDb, getFirebaseFunctions } from '@/shared/services/firebase';
import {
  registerSyncOperationHandler,
  runOrEnqueueSyncOperation,
  type ChatMessageSyncPayload,
} from '@/features/sync';

import type {
  ChatMessage,
  ChatRoom,
  GroupOpening,
  SpontaneousRound,
  SpontaneousRoundInvitePreview,
} from '../types';
import type {
  ChatActor,
  ChatService,
  GroupMember,
  RoomMemberProfile,
  Unsubscribe,
} from './chatService.types';
import { loadCachedMessages, saveCachedMessages } from './messageCache';

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
    ...(data.roundStatus === 'forming' ? { roundStatus: 'forming' as const } : {}),
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
  return (
    docs
      .map((item) => mapRoom(item.id, item.data()))
      // The UI stays newest-first; expireAt only leads the bounded query.
      .sort((first, second) => second.createdAt - first.createdAt)
  );
}

async function writeMessage(
  actor: ChatActor,
  roomId: string,
  text: string,
  extra: Record<string, unknown> = {},
  clientMessageId?: string,
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
    ...(clientMessageId ? { clientMessageId } : {}),
  });
}

async function submitTextMessage(payload: ChatMessageSyncPayload) {
  const sendMessage = httpsCallable(getFirebaseFunctions(), 'sendChatMessage');
  await sendMessage({
    roomId: payload.roomId,
    text: payload.text,
    clientMessageId: payload.clientMessageId,
  });
}

registerSyncOperationHandler('chat.message', async (operation) => {
  if (operation.kind !== 'chat.message') return;
  await submitTextMessage(operation.payload);
});

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
    // The device cache gives an instant first paint, but the live source of
    // truth is ALWAYS the newest bounded window. Anchoring a listener after a
    // cached timestamp looked cheaper, but it could permanently leave a gap
    // when more than MESSAGE_LIMIT messages arrived while the room was closed.
    // One open room costs at most this small initial window; older history is
    // explicitly paged only when the person asks for it.
    let cancelled = false;
    let detach: Unsubscribe = () => {};
    void loadCachedMessages(roomId).then((cached) => {
      if (cancelled) return;
      let known = cached.map((m) => ({ ...m, isMe: m.authorId === actor.uid }));
      if (known.length) cb([...known]);

      const q = query(
        messagesRef(roomId),
        orderBy('createdAt', 'desc'),
        orderBy(documentId(), 'desc'),
        limit(MESSAGE_LIMIT),
      );

      detach = onSnapshot(
        q,
        (snapshot) => {
          // Replace, rather than merge with an old cache: this is the newest
          // contiguous server window. ChatProvider merges it with explicitly
          // loaded older pages by id, so stale cache entries cannot create an
          // invisible hole between history and the current conversation.
          known = snapshot.docs.map((d) => mapMessage(actor, d.id, roomId, d.data())).reverse();
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

  async loadOlderMessages(actor, roomId, cursor) {
    // (createdAt desc, __name__ desc) is a total order, so startAfter can never
    // land mid-millisecond and drop or duplicate a message. Firestore adds the
    // __name__ tiebreaker to every query implicitly; naming it makes the
    // pagination contract explicit and the index deterministic.
    const snapshot = await getDocs(
      query(
        messagesRef(roomId),
        orderBy('createdAt', 'desc'),
        orderBy(documentId(), 'desc'),
        startAfter(Timestamp.fromMillis(cursor.createdAt), cursor.id),
        limit(MESSAGE_LIMIT),
      ),
    );
    const messages = snapshot.docs.map((d) => mapMessage(actor, d.id, roomId, d.data())).reverse();
    return { messages, reachedStart: snapshot.size < MESSAGE_LIMIT };
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

  async sendMessage(actor, roomId, text, clientMessageId) {
    const trimmed = text.trim();
    if (!trimmed) return 'sent';
    const id = clientMessageId ?? `message_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload: ChatMessageSyncPayload = { roomId, text: trimmed, clientMessageId: id };
    return runOrEnqueueSyncOperation(
      {
        id: `chat.message:${id}`,
        accountId: actor.uid,
        kind: 'chat.message',
        payload,
        createdAt: Date.now(),
        attempts: 0,
        status: 'queued',
      },
      () => submitTextMessage(payload),
    );
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

  async inviteToGroup(_actor, roomId, inviteeUids) {
    const result = await httpsCallable<
      { roomId: string; inviteeUids: string[] },
      { ok: true; invited: number; skipped: number }
    >(
      getFirebaseFunctions(),
      'inviteToGroupChat',
    )({ roomId, inviteeUids });
    return { invited: result.data.invited, skipped: result.data.skipped };
  },

  async respondToGroupInvite(_actor, roomId, accept) {
    await httpsCallable(getFirebaseFunctions(), 'respondToGroupChatInvite')({ roomId, accept });
  },

  subscribeGroupOpenings(actor, cb) {
    const q = query(
      collection(getFirebaseDb(), 'groupOpenings'),
      where('audienceUids', 'array-contains', actor.uid),
      where('status', '==', 'active'),
      where('expireAt', '>', Timestamp.fromMillis(Date.now())),
      limit(20),
    );
    return onSnapshot(
      q,
      (snapshot) => {
        cb(
          snapshot.docs.flatMap((d): GroupOpening[] => {
            const data = d.data();
            if (data.kind === 'spontaneous') return [];
            return [
              {
                id: d.id,
                title: typeof data.title === 'string' ? data.title : 'Planung',
                ...(typeof data.vibe === 'string' ? { vibe: data.vibe } : {}),
                memberCount: typeof data.memberCount === 'number' ? data.memberCount : 0,
                memberPreview: Array.isArray(data.memberPreview) ? data.memberPreview : [],
              },
            ];
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

  async startSpontaneousRound(_actor, members) {
    const result = await httpsCallable<{ inviteeUids: string[] }, { ok: true; id: string }>(
      getFirebaseFunctions(),
      'startSpontaneousRound',
    )({ inviteeUids: members.map((member) => member.id) });
    return result.data.id;
  },

  async acceptSpontaneousRound(_actor, roundId) {
    await httpsCallable(getFirebaseFunctions(), 'acceptSpontaneousRound')({ roundId });
  },

  async getSpontaneousRoundInvitePreview(_actor, roundId) {
    const result = await httpsCallable<
      { roundId: string },
      | { state: 'unavailable' }
      | {
          state: 'available';
          roundId: string;
          host: { uid: string; displayName: string; initials: string };
          memberCount: number;
          memberPreview: { uid: string; displayName: string; initials: string }[];
          expiresAt: number;
        }
    >(
      getFirebaseFunctions(),
      'getSpontaneousRoundInvitePreview',
    )({ roundId });
    const data = result.data;
    if (
      data.state !== 'available' ||
      typeof data.roundId !== 'string' ||
      typeof data.expiresAt !== 'number' ||
      typeof data.memberCount !== 'number' ||
      !data.host ||
      typeof data.host.uid !== 'string' ||
      typeof data.host.displayName !== 'string' ||
      typeof data.host.initials !== 'string' ||
      !Array.isArray(data.memberPreview)
    ) {
      return null;
    }
    const memberPreview = data.memberPreview.flatMap((member) =>
      member &&
      typeof member.uid === 'string' &&
      typeof member.displayName === 'string' &&
      typeof member.initials === 'string'
        ? [member]
        : [],
    );
    return {
      roundId: data.roundId,
      host: data.host,
      memberCount: data.memberCount,
      memberPreview,
      expiresAt: data.expiresAt,
    } satisfies SpontaneousRoundInvitePreview;
  },

  async declineSpontaneousRound(_actor, roundId) {
    await httpsCallable(getFirebaseFunctions(), 'declineSpontaneousRound')({ roundId });
  },

  async leaveSpontaneousRound(_actor, roundId) {
    await httpsCallable(getFirebaseFunctions(), 'leaveSpontaneousRound')({ roundId });
  },

  subscribeSpontaneousRound(actor, cb) {
    const q = query(
      collection(getFirebaseDb(), 'groupOpenings'),
      where('audienceUids', 'array-contains', actor.uid),
      where('kind', '==', 'spontaneous'),
      where('status', '==', 'active'),
      where('expireAt', '>', Timestamp.fromMillis(Date.now())),
      limit(1),
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const docSnapshot = snapshot.docs[0];
        if (!docSnapshot) {
          cb(null);
          return;
        }
        const data = docSnapshot.data();
        const memberPreview = Array.isArray(data.memberPreview)
          ? data.memberPreview.flatMap((member: unknown) => {
              if (!member || typeof member !== 'object') return [];
              const value = member as Record<string, unknown>;
              if (
                typeof value.uid !== 'string' ||
                typeof value.displayName !== 'string' ||
                typeof value.initials !== 'string'
              ) {
                return [];
              }
              return [
                {
                  uid: value.uid,
                  displayName: value.displayName,
                  initials: value.initials,
                  ...(typeof value.avatarUrl === 'string' ? { avatarUrl: value.avatarUrl } : {}),
                },
              ];
            })
          : [];
        if (typeof data.hostUid !== 'string' || !Array.isArray(data.memberIds)) {
          cb(null);
          return;
        }
        cb({
          id: docSnapshot.id,
          hostUid: data.hostUid,
          memberIds: data.memberIds.filter((uid): uid is string => typeof uid === 'string'),
          memberPreview,
          expiresAt: toMillis(data.expireAt),
        } satisfies SpontaneousRound);
      },
      () => cb(null),
    );
  },
};
