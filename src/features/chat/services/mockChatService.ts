import AsyncStorage from '@react-native-async-storage/async-storage';

import { mockActivityChats } from '@/data/mock';

import type { ChatMessage, ChatRoom, GroupOpening, ProposalData } from '../types';
import type {
  ChatActor,
  ChatService,
  GroupMember,
  RoomMemberProfile,
  Unsubscribe,
} from './chatService.types';

/**
 * In-memory/offline implementation of {@link ChatService}. Behaves like the
 * firebase one (same shapes, same TTL fields) but persists only the room list
 * to AsyncStorage; messages reseed from mocks per app run.
 */

const ROOMS_KEY = 'together.chat.rooms.v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_CHAT_RETENTION_MS = 12 * 60 * 60 * 1000;

const rooms = new Map<string, ChatRoom>();
const messages = new Map<string, ChatMessage[]>();
const roomSubs = new Set<(rooms: ChatRoom[]) => void>();
const msgSubs = new Map<string, Set<(messages: ChatMessage[]) => void>>();
// uid → displayName, filled wherever the mock learns a name (group creation,
// added members, the actor). Message authors fill remaining gaps on demand.
const knownNames = new Map<string, string>();
let loaded = false;

// One seeded "Offen für Dazustoßer" teaser so mock mode can demo joining a
// planning group you're NOT part of. Joining materialises the backing room.
const DEMO_OPENING: GroupOpening & { memberUids: string[] } = {
  id: 'group-open-demo',
  title: 'Spontan was essen',
  vibe: 'Essen',
  memberCount: 2,
  memberPreview: [
    { displayName: 'Mia Sommer', initials: 'MS' },
    { displayName: 'Ben Otto', initials: 'BO' },
  ],
  memberUids: ['u_mia', 'u_ben'],
};
const openings = new Map<string, GroupOpening & { memberUids: string[] }>([
  [DEMO_OPENING.id, DEMO_OPENING],
]);
const openingSubs = new Set<(openings: GroupOpening[]) => void>();

function emitOpenings(actorUid: string) {
  // Own rooms never show as openings — you're already in them.
  const list = [...openings.values()]
    .filter((opening) => !opening.memberUids.includes(actorUid))
    .map(({ memberUids: _memberUids, ...opening }) => opening);
  openingSubs.forEach((cb) => cb(list));
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase() || '??'
  );
}

/** Legacy rooms have no adminUids — the first member (creator) counts as admin. */
function adminsOf(room: ChatRoom): string[] {
  return room.adminUids?.length ? room.adminUids : room.memberIds.slice(0, 1);
}

function seededMessages(roomId: string): ChatMessage[] {
  if (!messages.has(roomId)) {
    messages.set(roomId, [...(mockActivityChats[roomId] ?? [])]);
  }
  return messages.get(roomId)!;
}

function roomList(): ChatRoom[] {
  return [...rooms.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function emitRooms() {
  const list = roomList();
  roomSubs.forEach((cb) => cb(list));
  AsyncStorage.setItem(ROOMS_KEY, JSON.stringify(list)).catch(() => {});
}

function emitMessages(roomId: string) {
  const list = [...seededMessages(roomId)];
  msgSubs.get(roomId)?.forEach((cb) => cb(list));
}

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(ROOMS_KEY);
    if (raw) {
      for (const room of JSON.parse(raw) as ChatRoom[]) {
        if (!rooms.has(room.id)) {
          // Message history is reseeded from mocks, so counters must match what
          // this run can actually show.
          const seeds = seededMessages(room.id);
          rooms.set(room.id, { ...room, messageCount: seeds.length });
        }
      }
    }
  } catch {
    // best-effort persistence
  }
}

function touchRoom(
  roomId: string,
  actor: ChatActor,
  message: ChatMessage,
  expireAt: number | undefined,
) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.lastMessage = {
    text: message.text,
    authorId: actor.uid,
    authorName: actor.displayName,
    at: message.createdAt,
  };
  room.messageCount += 1;
  if (expireAt) room.expireAt = expireAt;
  emitRooms();
}

function buildMessage(
  actor: ChatActor,
  roomId: string,
  text: string,
  extra?: Partial<ChatMessage>,
): ChatMessage {
  return {
    id: `${roomId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    activityId: roomId,
    authorId: actor.uid,
    authorName: actor.displayName,
    initials: actor.initials,
    text,
    createdAt: Date.now(),
    isMe: true,
    ...extra,
  };
}

function updateProposal(
  roomId: string,
  messageId: string,
  updater: (data: ProposalData) => ProposalData,
) {
  const list = seededMessages(roomId);
  const index = list.findIndex((m) => m.id === messageId);
  if (index === -1 || !list[index].proposal) return;
  list[index] = { ...list[index], proposal: updater(list[index].proposal!) };
  emitMessages(roomId);
}

export const mockChatService: ChatService = {
  async getRooms(_actor) {
    await ensureLoaded();
    return roomList();
  },

  subscribeRooms(actor, cb) {
    roomSubs.add(cb);
    void ensureLoaded().then(() => cb(roomList()));
    return () => roomSubs.delete(cb);
  },

  async getRoom(actor, roomId) {
    await ensureLoaded();
    const room = rooms.get(roomId);
    if (!room || !room.memberIds.includes(actor.uid)) return undefined;
    if (room.expireAt && room.expireAt <= Date.now()) return undefined;
    return { ...room, memberIds: [...room.memberIds], readCount: { ...room.readCount } };
  },

  subscribeMessages(_actor, roomId, cb): Unsubscribe {
    if (!msgSubs.has(roomId)) msgSubs.set(roomId, new Set());
    msgSubs.get(roomId)!.add(cb);
    cb([...seededMessages(roomId)]);
    return () => msgSubs.get(roomId)?.delete(cb);
  },

  async joinActivity(actor, activity) {
    await ensureLoaded();
    const existing = rooms.get(activity.id);
    if (existing) {
      // A proposal promotes its existing group conversation into the activity
      // chat while preserving messages and members (same stable room id).
      existing.type = 'activity';
      existing.title = activity.title;
      existing.expireAt = Math.max(
        Date.now() + ACTIVITY_CHAT_RETENTION_MS,
        (activity.endsAt
          ? new Date(activity.endsAt).getTime()
          : activity.startsAt
            ? new Date(activity.startsAt).getTime()
            : Date.now()) + ACTIVITY_CHAT_RETENTION_MS,
      );
      if (!existing.memberIds.includes(actor.uid)) existing.memberIds.push(actor.uid);
    } else {
      const seeds = seededMessages(activity.id);
      const last = seeds[seeds.length - 1];
      rooms.set(activity.id, {
        id: activity.id,
        type: 'activity',
        title: activity.title,
        memberIds: [actor.uid],
        lastMessage: last
          ? {
              text: last.text,
              authorId: last.authorId,
              authorName: last.authorName,
              at: last.createdAt,
            }
          : undefined,
        messageCount: seeds.length,
        readCount: {},
        createdAt: Date.now(),
        expireAt: activity.endsAt
          ? new Date(activity.endsAt).getTime() + ACTIVITY_CHAT_RETENTION_MS
          : activity.startsAt
            ? Math.max(
                Date.now() + ACTIVITY_CHAT_RETENTION_MS,
                new Date(activity.startsAt).getTime() + ACTIVITY_CHAT_RETENTION_MS,
              )
            : Date.now() + ACTIVITY_CHAT_RETENTION_MS,
      });
    }
    emitRooms();
  },

  async leaveRoom(actor, roomId) {
    await ensureLoaded();
    const room = rooms.get(roomId);
    if (!room || !room.memberIds.includes(actor.uid)) return;
    room.memberIds = room.memberIds.filter((uid) => uid !== actor.uid);
    // Admin succession (same contract as the callable): last admin out →
    // longest-standing member inherits; an emptied room is dropped.
    let admins = adminsOf(room).filter((uid) => uid !== actor.uid);
    if (!admins.length && room.memberIds.length) admins = [room.memberIds[0]];
    room.adminUids = admins;
    if (!room.memberIds.length) rooms.delete(roomId);
    emitRooms();
  },

  async createGroup(actor, members: GroupMember[], vibe) {
    await ensureLoaded();
    const id = `group-${Date.now()}`;
    const names = members.map((m) => m.displayName);
    knownNames.set(actor.uid, actor.displayName);
    members.forEach((m) => knownNames.set(m.id, m.displayName));
    rooms.set(id, {
      id,
      type: 'group',
      title:
        vibe?.trim() || (names.length ? `Mit ${names.slice(0, 3).join(', ')}` : 'Neue Planung'),
      vibe: vibe?.trim() || undefined,
      memberIds: [actor.uid, ...members.map((m) => m.id)],
      adminUids: [actor.uid],
      messageCount: 0,
      readCount: {},
      createdAt: Date.now(),
      expireAt: Date.now() + 30 * DAY_MS,
    });
    seededMessages(id);
    emitRooms();
    return id;
  },

  async sendMessage(actor, roomId, text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const message = buildMessage(actor, roomId, trimmed);
    seededMessages(roomId).push(message);
    emitMessages(roomId);
    touchRoom(roomId, actor, message, Date.now() + 30 * DAY_MS);
  },

  async sendProposal(actor, roomId, data) {
    const message = buildMessage(actor, roomId, data.what ?? 'Vorschlag', {
      kind: 'proposal',
      proposal: { ...data, confirmedBy: [actor.uid] },
    });
    seededMessages(roomId).push(message);
    emitMessages(roomId);
    touchRoom(roomId, actor, message, Date.now() + 30 * DAY_MS);
  },

  async toggleProposalConfirm(actor, roomId, messageId, alreadyConfirmed) {
    updateProposal(roomId, messageId, (data) => ({
      ...data,
      confirmedBy: alreadyConfirmed
        ? data.confirmedBy.filter((uid) => uid !== actor.uid)
        : [...data.confirmedBy, actor.uid],
    }));
  },

  async markProposalPlanned(_actor, roomId, messageId) {
    updateProposal(roomId, messageId, (data) => ({ ...data, planned: true }));
  },

  async markRead(actor, roomId, seenCount) {
    const room = rooms.get(roomId);
    if (!room) return;
    if ((room.readCount[actor.uid] ?? 0) >= seenCount) return;
    room.readCount = { ...room.readCount, [actor.uid]: seenCount };
    emitRooms();
  },

  async getRoomMembers(actor, roomId): Promise<RoomMemberProfile[]> {
    const memberIds = rooms.get(roomId)?.memberIds ?? [];
    knownNames.set(actor.uid, actor.displayName);
    // Message authors are a free name source for members the registry missed
    // (e.g. seeded rooms after an app restart).
    messages.forEach((list) =>
      list.forEach((m) => {
        if (!knownNames.has(m.authorId)) knownNames.set(m.authorId, m.authorName);
      }),
    );
    return memberIds.map((uid) => {
      const displayName = knownNames.get(uid) ?? 'Freund:in';
      return { uid, displayName, initials: initialsOf(displayName) };
    });
  },

  async removeMember(actor, roomId, memberUid) {
    await ensureLoaded();
    const room = rooms.get(roomId);
    if (!room) throw new Error('Raum nicht gefunden.');
    if (room.type !== 'group') throw new Error('Nur Planungen haben verwaltbare Teilnehmer.');
    if (!adminsOf(room).includes(actor.uid)) throw new Error('Nur Admins können entfernen.');
    if (adminsOf(room).includes(memberUid)) throw new Error('Admins können nicht entfernt werden.');
    room.memberIds = room.memberIds.filter((uid) => uid !== memberUid);
    room.adminUids = adminsOf(room);
    emitRooms();
  },

  async promoteAdmin(actor, roomId, memberUid) {
    await ensureLoaded();
    const room = rooms.get(roomId);
    if (!room) throw new Error('Raum nicht gefunden.');
    if (room.type !== 'group') throw new Error('Nur Planungen haben verwaltbare Teilnehmer.');
    if (!adminsOf(room).includes(actor.uid)) throw new Error('Nur Admins können befördern.');
    if (!room.memberIds.includes(memberUid)) throw new Error('Diese Person ist kein Mitglied.');
    const admins = adminsOf(room);
    if (!admins.includes(memberUid)) room.adminUids = [...admins, memberUid];
    emitRooms();
  },

  async renameRoom(actor, roomId, title) {
    await ensureLoaded();
    const room = rooms.get(roomId);
    if (!room) throw new Error('Raum nicht gefunden.');
    if (room.type !== 'group') throw new Error('Activity-Chats tragen den Activity-Namen.');
    if (!adminsOf(room).includes(actor.uid)) throw new Error('Nur Admins können umbenennen.');
    const trimmed = title.trim();
    if (!trimmed) throw new Error('Der Name darf nicht leer sein.');
    room.title = trimmed.slice(0, 80);
    const opening = openings.get(roomId);
    if (opening) opening.title = room.title;
    emitRooms();
  },

  subscribeGroupOpenings(actor, cb) {
    openingSubs.add(cb);
    emitOpenings(actor.uid);
    return () => openingSubs.delete(cb);
  },

  async setGroupOpen(actor, roomId, open) {
    await ensureLoaded();
    const room = rooms.get(roomId);
    if (!room) throw new Error('Raum nicht gefunden.');
    if (room.type !== 'group') throw new Error('Nur Planungen können sich öffnen.');
    if (!adminsOf(room).includes(actor.uid)) throw new Error('Nur Admins können das ändern.');
    room.joinable = open;
    if (open) {
      openings.set(roomId, {
        id: roomId,
        title: room.title ?? 'Planung',
        ...(room.vibe ? { vibe: room.vibe } : {}),
        memberCount: room.memberIds.length,
        memberPreview: room.memberIds.slice(0, 4).map((uid) => {
          const displayName = knownNames.get(uid) ?? 'Freund:in';
          return { displayName, initials: initialsOf(displayName) };
        }),
        memberUids: [...room.memberIds],
      });
    } else {
      openings.delete(roomId);
    }
    emitRooms();
    emitOpenings(actor.uid);
  },

  async joinOpenGroup(actor, roomId) {
    await ensureLoaded();
    const opening = openings.get(roomId);
    if (!opening) throw new Error('Diese Planung ist nicht mehr offen.');
    let room = rooms.get(roomId);
    if (!room) {
      // Demo opening without a backing room yet — materialise it on join.
      opening.memberPreview.forEach((member, index) =>
        knownNames.set(opening.memberUids[index] ?? member.initials, member.displayName),
      );
      room = {
        id: roomId,
        type: 'group',
        title: opening.title,
        vibe: opening.vibe,
        memberIds: [...opening.memberUids],
        adminUids: opening.memberUids.slice(0, 1),
        joinable: true,
        messageCount: 0,
        readCount: {},
        createdAt: Date.now(),
        expireAt: Date.now() + 30 * DAY_MS,
      };
      rooms.set(roomId, room);
      seededMessages(roomId);
    }
    if (!room.memberIds.includes(actor.uid)) room.memberIds.push(actor.uid);
    opening.memberUids = [...room.memberIds];
    opening.memberCount = room.memberIds.length;
    emitRooms();
    emitOpenings(actor.uid);
  },
};
