import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

import { useAuth } from '@/features/auth';
import { claimNotificationResponse } from '@/features/notifications/notificationResponse';

import { chatService } from './services/chatService';
import type { ChatActor, GroupMember, RoomMemberProfile } from './services/chatService.types';
import { loadCachedRooms, saveCachedRooms } from './services/roomCache';
import type {
  ChatGroup,
  ChatMessage,
  ChatRoom,
  GroupOpening,
  ProposalData,
  SpontaneousRound,
} from './types';

export type { GroupMember, RoomMemberProfile };

export interface ChatContextValue {
  /** Joined room ids (activities + groups), newest first. */
  joinedIds: string[];
  isJoined: (roomId: string) => boolean;
  joinActivity: (
    roomId: string,
    info?: { title?: string; startsAt?: string; endsAt?: string },
  ) => void;
  leaveRoom: (roomId: string) => void;
  /** Creates a group room and resolves with its id. */
  createGroup: (members: GroupMember[], vibe?: string) => Promise<string>;
  getGroup: (roomId: string) => ChatGroup | undefined;
  getRoom: (roomId: string) => ChatRoom | undefined;
  /**
   * Messages for a room. Full history only while the room is opened via
   * openRoom(); otherwise a 1-element preview derived from the room summary
   * (listener budget: messages are only streamed for the open room).
   */
  getMessages: (roomId: string) => ChatMessage[];
  sendMessage: (roomId: string, text: string) => void;
  /** Re-sends a failed optimistic message (tap-to-retry on the bubble). */
  retryMessage: (roomId: string, messageId: string) => void;
  sendProposal: (roomId: string, data: Omit<ProposalData, 'confirmedBy' | 'planned'>) => void;
  toggleProposalConfirm: (roomId: string, messageId: string) => void;
  markProposalPlanned: (roomId: string, messageId: string) => void;
  getUnreadCount: (roomId: string) => number;
  markRead: (roomId: string) => void;
  /** Attach/detach the message listener for the currently open chat. */
  openRoom: (roomId: string) => void;
  closeRoom: (roomId: string) => void;
  /** The room-summary listener is active only while the list is actually visible. */
  setRoomsListActive: (active: boolean) => void;
  /** True when the current user administrates the room (legacy fallback: creator). */
  isRoomAdmin: (roomId: string) => boolean;
  /** Display profiles of a room's members — one-off fetch, no listener. */
  getRoomMembers: (roomId: string) => Promise<RoomMemberProfile[]>;
  /** Management actions reject with a user-presentable error (admin/round only). */
  removeMember: (roomId: string, memberUid: string) => Promise<void>;
  promoteAdmin: (roomId: string, memberUid: string) => Promise<void>;
  renameRoom: (roomId: string, title: string) => Promise<void>;
  /** Joinable-group teasers ("Am Planen"). Empty unless openings are watched. */
  groupOpenings: GroupOpening[];
  /** The openings listener runs ONLY while a consumer needs it (NearbySheet). */
  setOpeningsActive: (active: boolean) => void;
  setGroupOpen: (roomId: string, open: boolean) => Promise<void>;
  joinOpenGroup: (roomId: string) => Promise<void>;
  spontaneousRound: SpontaneousRound | null;
  setRoundSurfaceActive: (active: boolean) => void;
  startSpontaneousRound: (members: GroupMember[]) => Promise<string>;
  acceptSpontaneousRound: (roundId: string) => Promise<void>;
  leaveSpontaneousRound: (roundId: string) => Promise<void>;
}

export const ChatContext = createContext<ChatContextValue | null>(null);

/**
 * Activity/map state deliberately excludes the open room's message array.
 * Receiving a message must not make the native map reconcile its markers.
 */
export type ChatActivityContextValue = Pick<
  ChatContextValue,
  | 'joinedIds'
  | 'isJoined'
  | 'joinActivity'
  | 'leaveRoom'
  | 'createGroup'
  | 'getGroup'
  | 'getRoom'
  | 'markProposalPlanned'
  | 'getUnreadCount'
  | 'isRoomAdmin'
  | 'getRoomMembers'
  | 'removeMember'
  | 'promoteAdmin'
  | 'renameRoom'
  | 'groupOpenings'
  | 'setOpeningsActive'
  | 'setGroupOpen'
  | 'joinOpenGroup'
  | 'spontaneousRound'
  | 'setRoundSurfaceActive'
  | 'startSpontaneousRound'
  | 'acceptSpontaneousRound'
  | 'leaveSpontaneousRound'
>;

export const ChatActivityContext = createContext<ChatActivityContextValue | null>(null);

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'DU'
  );
}

function sortRooms(rooms: ChatRoom[]) {
  const now = Date.now();
  return rooms
    .filter((room) => !room.expireAt || room.expireAt > now)
    .sort((first, second) => second.createdAt - first.createdAt)
    .slice(0, 30);
}

function readChatPush(data: unknown): { roomId: string; messageCount?: number } | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  if (payload.kind !== 'chat_message' || typeof payload.roomId !== 'string') return null;
  return {
    roomId: payload.roomId,
    ...(typeof payload.messageCount === 'number' ? { messageCount: payload.messageCount } : {}),
  };
}

/**
 * Chat state, backed by the chat service and Firestore.
 * Uses a per-device cache + one-off foreground sync for room summaries. The
 * only rooms listener exists while the visible activity list needs live rows;
 * messages still stream exclusively for the open room.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const actor = useMemo<ChatActor>(
    () => ({
      uid: user?.id ?? 'u_you',
      displayName: user?.displayName ?? 'Du',
      initials: initialsOf(user?.displayName ?? 'Du'),
    }),
    [user?.id, user?.displayName],
  );

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const roomsRef = useRef<ChatRoom[]>([]);
  const [roomsCacheReady, setRoomsCacheReady] = useState(false);
  const [roomsListActive, setRoomsListActive] = useState(false);
  const roomsListActiveRef = useRef(false);
  const [appBackgrounded, setAppBackgrounded] = useState(AppState.currentState === 'background');
  const [foregroundEpoch, setForegroundEpoch] = useState(0);
  const wasBackgrounded = useRef(AppState.currentState === 'background');
  // A push can arrive while no room list is subscribed. This is intentionally
  // only a local "new" signal; opening/foreground always reconciles against
  // Firestore before an exact badge is trusted.
  const [pushedUnreadRooms, setPushedUnreadRooms] = useState<Record<string, number>>({});
  const pushedUnreadRoomsRef = useRef<Record<string, number>>({});
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, ChatMessage[]>>({});
  // Optimistic local echoes: a sent message appears instantly (marked
  // `pending`) instead of waiting for the callable→Firestore→listener
  // round-trip, which reads as "nothing happened" on a real network.
  const [pendingByRoom, setPendingByRoom] = useState<Record<string, ChatMessage[]>>({});
  // Stack of rooms currently held open by a chat surface. Multiple surfaces can
  // overlap (inline sheet chat below a full-screen Modal) — a plain single id
  // would let the FIRST surface's unmount tear down the listener the surface on
  // top still needs. Only the topmost entry streams messages.
  const [openRoomStack, setOpenRoomStack] = useState<string[]>([]);
  const openRoomId = openRoomStack.length ? openRoomStack[openRoomStack.length - 1] : null;
  // Optimistically-joined room ids: `joinActivity` writes go through a backend
  // round-trip, so without this the
  // "Dazustoßen" button appears to do nothing until the rooms listener catches
  // up. Marking the id here flips `isJoined` instantly; the listener then keeps
  // it true, so there's no flicker back.
  const [optimisticJoined, setOptimisticJoined] = useState<Set<string>>(() => new Set());

  const commitRooms = useCallback(
    (next: ChatRoom[]) => {
      const normalized = sortRooms(next);
      roomsRef.current = normalized;
      setRooms(normalized);
      saveCachedRooms(actor.uid, normalized);
    },
    [actor.uid],
  );

  const applyRoomList = useCallback(
    (next: ChatRoom[]) => {
      commitRooms(next);
      pushedUnreadRoomsRef.current = {};
      setPushedUnreadRooms({});
    },
    [commitRooms],
  );

  const upsertRoom = useCallback(
    (room: ChatRoom) => {
      commitRooms([room, ...roomsRef.current.filter((current) => current.id !== room.id)]);
      if (pushedUnreadRoomsRef.current[room.id] !== undefined) {
        const next = { ...pushedUnreadRoomsRef.current };
        delete next[room.id];
        pushedUnreadRoomsRef.current = next;
        setPushedUnreadRooms(next);
      }
    },
    [commitRooms],
  );

  const refreshRooms = useCallback(async () => {
    try {
      applyRoomList(await chatService.getRooms(actor));
    } catch (error) {
      // Cached summaries remain usable offline. The next visible list/open room
      // will reconcile again instead of replacing the UI with an empty state.
      console.warn('[chat] Raumliste konnte nicht abgeglichen werden:', error);
    }
  }, [actor, applyRoomList]);

  const refreshSingleRoom = useCallback(
    (roomId: string) => {
      void chatService
        .getRoom(actor, roomId)
        .then((room) => {
          if (room) upsertRoom(room);
        })
        .catch((error) => console.warn('[chat] Raum konnte nicht abgeglichen werden:', error));
    },
    [actor, upsertRoom],
  );

  // Restore the account-scoped cache before any network reconciliation. A
  // signed-out/new account can therefore never inherit another user's rooms.
  useEffect(() => {
    let cancelled = false;
    setRoomsCacheReady(false);
    roomsRef.current = [];
    setRooms([]);
    pushedUnreadRoomsRef.current = {};
    setPushedUnreadRooms({});
    void loadCachedRooms(actor.uid).then((cached) => {
      if (cancelled) return;
      roomsRef.current = cached;
      setRooms(cached);
      setRoomsCacheReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [actor.uid]);

  // Backgrounded apps do not need live unread/preview updates: push wakes the
  // user if needed, and the native cache makes the foreground resume immediate.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        wasBackgrounded.current = true;
        setAppBackgrounded(true);
      } else if (nextState === 'active' && wasBackgrounded.current) {
        wasBackgrounded.current = false;
        setAppBackgrounded(false);
        setForegroundEpoch((current) => current + 1);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    roomsListActiveRef.current = roomsListActive;
  }, [roomsListActive]);

  // One bounded read on first foreground and each background â†’ foreground
  // transition. This is the truth reconciliation for cache/push state.
  useEffect(() => {
    if (!roomsCacheReady || appBackgrounded || roomsListActiveRef.current) return;
    void refreshRooms();
  }, [appBackgrounded, foregroundEpoch, refreshRooms, roomsCacheReady]);

  // Listener 1: room summaries only while their visible list is open.
  useEffect(() => {
    if (appBackgrounded || !roomsListActive) return;
    return chatService.subscribeRooms(actor, applyRoomList);
  }, [actor, appBackgrounded, applyRoomList, roomsListActive]);

  const markPushedUnread = useCallback(
    ({ roomId, messageCount }: { roomId: string; messageCount?: number }) => {
      const previous = pushedUnreadRoomsRef.current[roomId] ?? 0;
      const nextCount = Math.max(
        previous,
        Number.isFinite(messageCount) ? (messageCount ?? 0) : 1,
        1,
      );
      const nextSignals = { ...pushedUnreadRoomsRef.current, [roomId]: nextCount };
      pushedUnreadRoomsRef.current = nextSignals;
      setPushedUnreadRooms(nextSignals);

      // Count metadata is safe to carry in the push payload and lets an
      // existing cached row show a useful badge. The message text deliberately
      // never travels in the system notification or its data payload.
      const cached = roomsRef.current.find((room) => room.id === roomId);
      if (cached && messageCount && messageCount > cached.messageCount) {
        commitRooms(
          roomsRef.current.map((room) => (room.id === roomId ? { ...room, messageCount } : room)),
        );
      }
    },
    [commitRooms],
  );

  // Push is a wake-up signal, never the data source. Do not read Firestore for
  // every foreground push; retain only a local "new" marker until the next
  // bounded reconciliation or until that specific chat is opened.
  useEffect(() => {
    const receive = Notifications.addNotificationReceivedListener((notification) => {
      const payload = readChatPush(notification.request.content.data);
      if (payload) markPushedUnread(payload);
    });
    const response = Notifications.addNotificationResponseReceivedListener(
      (notificationResponse) => {
        const payload = readChatPush(notificationResponse.notification.request.content.data);
        if (payload && claimNotificationResponse('chat', notificationResponse)) {
          markPushedUnread(payload);
        }
      },
    );
    void Notifications.getLastNotificationResponseAsync()
      .then((lastResponse) => {
        const payload = readChatPush(lastResponse?.notification.request.content.data);
        if (lastResponse && payload && claimNotificationResponse('chat', lastResponse)) {
          markPushedUnread(payload);
        }
      })
      .catch(() => {});
    return () => {
      receive.remove();
      response.remove();
    };
  }, [markPushedUnread]);

  // Listener 2: messages of the open room only.
  useEffect(() => {
    if (appBackgrounded || !openRoomId) return;
    return chatService.subscribeMessages(actor, openRoomId, (messages) => {
      setMessagesByRoom((current) => ({ ...current, [openRoomId]: messages }));
      // The server echo replaces the local pending copy (matched by author +
      // text; the time guard tolerates minor clock skew).
      setPendingByRoom((current) => {
        const pending = current[openRoomId];
        if (!pending?.length) return current;
        // 1:1 matching: each incoming message may resolve AT MOST one pending
        // echo. Two identical texts sent quickly (e.g. "ok", "ok") both match
        // the same first-arrived server copy under an "any match" filter,
        // silently dropping both pending bubbles even though only one server
        // message exists yet — exactly the "messages get overwritten" bug.
        const unmatched = [...messages];
        const remaining = pending.filter((p) => {
          const index = unmatched.findIndex(
            (m) =>
              m.authorId === p.authorId && m.text === p.text && m.createdAt >= p.createdAt - 15_000,
          );
          if (index === -1) return true;
          unmatched.splice(index, 1);
          return false;
        });
        if (remaining.length === pending.length) return current;
        return { ...current, [openRoomId]: remaining };
      });
    });
  }, [actor, openRoomId, appBackgrounded]);

  // Listener 3 (on demand): joinable-group teasers, only while the NearbySheet
  // (or another consumer) explicitly watches them.
  const [openingsActive, setOpeningsActive] = useState(false);
  const [groupOpenings, setGroupOpenings] = useState<GroupOpening[]>([]);
  useEffect(() => {
    if (appBackgrounded || !openingsActive) {
      setGroupOpenings([]);
      return;
    }
    return chatService.subscribeGroupOpenings(actor, setGroupOpenings);
  }, [actor, openingsActive, appBackgrounded]);

  // One tightly bounded listener powers the fixed map control. It is not an
  // inbox listener: it exists only while the map itself is visible and returns
  // at most one forming round because server rules allow only one membership.
  const [roundSurfaceActive, setRoundSurfaceActive] = useState(false);
  const [spontaneousRound, setSpontaneousRound] = useState<SpontaneousRound | null>(null);
  useEffect(() => {
    if (appBackgrounded || !roundSurfaceActive) {
      setSpontaneousRound(null);
      return;
    }
    return chatService.subscribeSpontaneousRound(actor, (round) => {
      setSpontaneousRound(round);
      // The host has no room until the first person accepts. Reconcile that
      // one document when the listener observes the transition, without
      // keeping the complete room list live on the map.
      if (round && round.memberIds.length >= 2 && !roomsRef.current.some((room) => room.id === round.id)) {
        refreshSingleRoom(round.id);
      }
    });
  }, [actor, appBackgrounded, refreshSingleRoom, roundSurfaceActive]);

  const findRoom = useCallback((roomId: string) => rooms.find((r) => r.id === roomId), [rooms]);

  const getUnreadCount = useCallback(
    (roomId: string) => {
      const room = findRoom(roomId);
      const persisted = room
        ? Math.max(0, room.messageCount - (room.readCount[actor.uid] ?? 0))
        : 0;
      return Math.max(persisted, pushedUnreadRooms[roomId] ? 1 : 0);
    },
    [actor.uid, findRoom, pushedUnreadRooms],
  );

  // These controls are consumed by effects inside the chat surfaces. Keeping
  // their identities stable prevents an open message listener from being
  // torn down and recreated whenever a room summary or message changes.
  const openRoom = useCallback(
    (roomId: string) => {
      setOpenRoomStack((current) => [...current, roomId]);
      // Do not pay a document read for every open chat. A targeted read is
      // required only for a missing/stale (push-signalled) room summary.
      if (
        !roomsRef.current.some((room) => room.id === roomId) ||
        pushedUnreadRoomsRef.current[roomId]
      ) {
        refreshSingleRoom(roomId);
      }
    },
    [refreshSingleRoom],
  );
  const closeRoom = useCallback(
    (roomId: string) =>
      setOpenRoomStack((current) => {
        const index = current.lastIndexOf(roomId);
        if (index === -1) return current;
        const next = [...current];
        next.splice(index, 1);
        return next;
      }),
    [],
  );

  const getMessages = useCallback(
    (roomId: string): ChatMessage[] => {
      const pending = pendingByRoom[roomId] ?? [];
      const full = messagesByRoom[roomId];
      if (full?.length) {
        const mapped = full.map((m) => ({ ...m, isMe: m.authorId === actor.uid }));
        return pending.length ? [...mapped, ...pending] : mapped;
      }
      const last = findRoom(roomId)?.lastMessage;
      // Preview stub derived from the denormalized summary (no message reads).
      const stub: ChatMessage[] = last
        ? [
            {
              id: `${roomId}-preview`,
              activityId: roomId,
              authorId: last.authorId,
              authorName: last.authorName,
              initials: initialsOf(last.authorName),
              text: last.text,
              createdAt: last.at,
              isMe: last.authorId === actor.uid,
            },
          ]
        : [];
      return pending.length ? [...stub, ...pending] : stub;
    },
    [messagesByRoom, pendingByRoom, findRoom, actor.uid],
  );

  // Fire-and-forget writes must never surface as unhandled rejections (red
  // dev toast / silent prod failure) — e.g. writing to a room that only
  // no longer exists in Firestore.
  const fireAndForget = useCallback((action: string, promise: Promise<unknown>) => {
    promise.catch((error) => console.warn(`[chat] ${action} fehlgeschlagen:`, error));
  }, []);

  // Without a permanent room listener, membership changes must also update the
  // local summary cache. Otherwise a room could remain visible until the next
  // foreground reconciliation after the user has deliberately left it.
  const removeRoomLocally = useCallback(
    (roomId: string) => {
      commitRooms(roomsRef.current.filter((room) => room.id !== roomId));
      if (pushedUnreadRoomsRef.current[roomId] !== undefined) {
        const next = { ...pushedUnreadRoomsRef.current };
        delete next[roomId];
        pushedUnreadRoomsRef.current = next;
        setPushedUnreadRooms(next);
      }
    },
    [commitRooms],
  );

  const joinActivity = useCallback(
    (roomId: string, info?: { title?: string; startsAt?: string; endsAt?: string }) => {
      setOptimisticJoined((current) =>
        current.has(roomId) ? current : new Set(current).add(roomId),
      );
      void chatService
        .joinActivity(actor, {
          id: roomId,
          title: info?.title ?? 'Activity',
          startsAt: info?.startsAt,
          endsAt: info?.endsAt,
        })
        .then(() => refreshSingleRoom(roomId))
        .catch((error) => {
          setOptimisticJoined((current) => {
            if (!current.has(roomId)) return current;
            const next = new Set(current);
            next.delete(roomId);
            return next;
          });
          console.warn('[chat] joinActivity fehlgeschlagen:', error);
        });
    },
    [actor, refreshSingleRoom],
  );

  const leaveRoom = useCallback(
    (roomId: string) => {
      setOptimisticJoined((current) => {
        if (!current.has(roomId)) return current;
        const next = new Set(current);
        next.delete(roomId);
        return next;
      });
      setOpenRoomStack((current) => current.filter((id) => id !== roomId));
      removeRoomLocally(roomId);
      void chatService.leaveRoom(actor, roomId).catch((error) => {
        // Restore the server truth if the optimistic leave did not persist
        // (for example after a transient offline failure).
        console.warn('[chat] leaveRoom fehlgeschlagen:', error);
        void refreshRooms();
      });
    },
    [actor, refreshRooms, removeRoomLocally],
  );

  const createGroup = useCallback(
    async (members: GroupMember[], vibe?: string) => {
      const roomId = await chatService.createGroup(actor, members, vibe);
      // A newly-created room should be available immediately even when the
      // room list is closed and deliberately has no live listener.
      refreshSingleRoom(roomId);
      return roomId;
    },
    [actor, refreshSingleRoom],
  );

  const startSpontaneousRound = useCallback(
    async (members: GroupMember[]) => chatService.startSpontaneousRound(actor, members),
    [actor],
  );

  const acceptSpontaneousRound = useCallback(
    async (roundId: string) => {
      await chatService.acceptSpontaneousRound(actor, roundId);
      setOptimisticJoined((current) => new Set(current).add(roundId));
      refreshSingleRoom(roundId);
    },
    [actor, refreshSingleRoom],
  );

  const leaveSpontaneousRound = useCallback(
    async (roundId: string) => {
      await chatService.leaveSpontaneousRound(actor, roundId);
      setOptimisticJoined((current) => {
        if (!current.has(roundId)) return current;
        const next = new Set(current);
        next.delete(roundId);
        return next;
      });
      setOpenRoomStack((current) => current.filter((id) => id !== roundId));
      removeRoomLocally(roundId);
      setSpontaneousRound((current) => (current?.id === roundId ? null : current));
    },
    [actor, removeRoomLocally],
  );

  const removePending = useCallback((roomId: string, messageId: string) => {
    setPendingByRoom((current) => {
      const pending = current[roomId];
      if (!pending?.some((m) => m.id === messageId)) return current;
      return { ...current, [roomId]: pending.filter((m) => m.id !== messageId) };
    });
  }, []);

  // Delivers one optimistic echo. On failure the echo is NOT dropped — it
  // flips to `failed` so the user sees it and can tap to retry; a silently
  // vanishing message is the worst possible outcome of a flaky network.
  const deliverPending = useCallback(
    (roomId: string, message: ChatMessage) => {
      chatService.sendMessage(actor, roomId, message.text).then(
        () => {
          // Normally the listener echo prunes the pending copy; this delayed
          // fallback only catches echoes the matcher missed (heavy clock skew).
          setTimeout(() => removePending(roomId, message.id), 5000);
        },
        (error) => {
          console.warn('[chat] sendMessage fehlgeschlagen:', error);
          setPendingByRoom((current) => {
            const pending = current[roomId];
            if (!pending?.some((m) => m.id === message.id)) return current;
            return {
              ...current,
              [roomId]: pending.map((m) => (m.id === message.id ? { ...m, failed: true } : m)),
            };
          });
        },
      );
    },
    [actor, removePending],
  );

  const joinedRoomIds = useMemo(() => {
    const ids = new Set(rooms.map((room) => room.id));
    optimisticJoined.forEach((id) => ids.add(id));
    return ids;
  }, [rooms, optimisticJoined]);

  // This context is consumed by large background surfaces such as MapScreen.
  // It changes for room summaries (membership/unread badges), but never for
  // the active chat's message stream.
  const activityValue = useMemo<ChatActivityContextValue>(
    () => ({
      joinedIds: [...joinedRoomIds],
      isJoined: (roomId) => joinedRoomIds.has(roomId),
      joinActivity,
      leaveRoom,
      createGroup,
      getGroup: (roomId) => {
        const room = findRoom(roomId);
        if (!room || room.type !== 'group') return undefined;
        return {
          id: room.id,
          title: room.title ?? 'Planung',
          memberIds: room.memberIds,
          vibe: room.vibe,
          createdAt: room.createdAt,
        };
      },
      getRoom: findRoom,
      markProposalPlanned: (roomId, messageId) => {
        fireAndForget(
          'markProposalPlanned',
          chatService.markProposalPlanned(actor, roomId, messageId),
        );
      },
      getUnreadCount,
      isRoomAdmin: (roomId) => {
        const room = findRoom(roomId);
        if (!room) return false;
        const admins = room.adminUids?.length ? room.adminUids : room.memberIds.slice(0, 1);
        return admins.includes(actor.uid);
      },
      getRoomMembers: (roomId) => chatService.getRoomMembers(actor, roomId),
      removeMember: (roomId, memberUid) => chatService.removeMember(actor, roomId, memberUid),
      promoteAdmin: (roomId, memberUid) => chatService.promoteAdmin(actor, roomId, memberUid),
      renameRoom: (roomId, title) => chatService.renameRoom(actor, roomId, title),
      groupOpenings,
      setOpeningsActive,
      setGroupOpen: (roomId, open) => chatService.setGroupOpen(actor, roomId, open),
      joinOpenGroup: (roomId) => chatService.joinOpenGroup(actor, roomId),
      spontaneousRound,
      setRoundSurfaceActive,
      startSpontaneousRound,
      acceptSpontaneousRound,
      leaveSpontaneousRound,
    }),
    [
      actor,
      createGroup,
      findRoom,
      fireAndForget,
      getUnreadCount,
      groupOpenings,
      joinActivity,
      joinedRoomIds,
      leaveRoom,
      spontaneousRound,
      startSpontaneousRound,
      acceptSpontaneousRound,
      leaveSpontaneousRound,
    ],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      joinedIds: [...joinedRoomIds],
      isJoined: (roomId) => joinedRoomIds.has(roomId),
      joinActivity,
      leaveRoom,
      createGroup,
      getGroup: (roomId) => {
        const room = findRoom(roomId);
        if (!room || room.type !== 'group') return undefined;
        return {
          id: room.id,
          title: room.title ?? 'Planung',
          memberIds: room.memberIds,
          vibe: room.vibe,
          createdAt: room.createdAt,
        };
      },
      getRoom: findRoom,
      getMessages,
      sendMessage: (roomId, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const pendingMessage: ChatMessage = {
          id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          activityId: roomId,
          authorId: actor.uid,
          authorName: actor.displayName,
          initials: actor.initials,
          text: trimmed,
          createdAt: Date.now(),
          isMe: true,
          pending: true,
        };
        setPendingByRoom((current) => ({
          ...current,
          [roomId]: [...(current[roomId] ?? []), pendingMessage],
        }));
        deliverPending(roomId, pendingMessage);
      },
      retryMessage: (roomId, messageId) => {
        const target = (pendingByRoom[roomId] ?? []).find((m) => m.id === messageId && m.failed);
        if (!target) return;
        const revived: ChatMessage = {
          ...target,
          failed: false,
          createdAt: Date.now(),
        };
        setPendingByRoom((current) => ({
          ...current,
          [roomId]: (current[roomId] ?? []).map((m) => (m.id === messageId ? revived : m)),
        }));
        deliverPending(roomId, revived);
      },
      sendProposal: (roomId, data) => {
        fireAndForget('sendProposal', chatService.sendProposal(actor, roomId, data));
      },
      toggleProposalConfirm: (roomId, messageId) => {
        const message = messagesByRoom[roomId]?.find((m) => m.id === messageId);
        const alreadyConfirmed = message?.proposal?.confirmedBy.includes(actor.uid) ?? false;
        fireAndForget(
          'toggleProposalConfirm',
          chatService.toggleProposalConfirm(actor, roomId, messageId, alreadyConfirmed),
        );
      },
      markProposalPlanned: (roomId, messageId) => {
        fireAndForget(
          'markProposalPlanned',
          chatService.markProposalPlanned(actor, roomId, messageId),
        );
      },
      getUnreadCount,
      markRead: (roomId) => {
        const room = findRoom(roomId);
        // Write only when something is actually unread — prevents write loops.
        if (!room || (room.readCount[actor.uid] ?? 0) >= room.messageCount) return;
        const seenCount = room.messageCount;
        commitRooms(
          roomsRef.current.map((current) =>
            current.id === roomId
              ? { ...current, readCount: { ...current.readCount, [actor.uid]: seenCount } }
              : current,
          ),
        );
        if (pushedUnreadRoomsRef.current[roomId] !== undefined) {
          const next = { ...pushedUnreadRoomsRef.current };
          delete next[roomId];
          pushedUnreadRoomsRef.current = next;
          setPushedUnreadRooms(next);
        }
        fireAndForget('markRead', chatService.markRead(actor, roomId, seenCount));
      },
      openRoom,
      closeRoom,
      isRoomAdmin: (roomId) => {
        const room = findRoom(roomId);
        if (!room) return false;
        const admins = room.adminUids?.length ? room.adminUids : room.memberIds.slice(0, 1);
        return admins.includes(actor.uid);
      },
      getRoomMembers: (roomId) => chatService.getRoomMembers(actor, roomId),
      removeMember: (roomId, memberUid) => chatService.removeMember(actor, roomId, memberUid),
      promoteAdmin: (roomId, memberUid) => chatService.promoteAdmin(actor, roomId, memberUid),
      renameRoom: (roomId, title) => chatService.renameRoom(actor, roomId, title),
      groupOpenings,
      setRoomsListActive,
      setOpeningsActive,
      setGroupOpen: (roomId, open) => chatService.setGroupOpen(actor, roomId, open),
      joinOpenGroup: (roomId) => chatService.joinOpenGroup(actor, roomId),
      spontaneousRound,
      setRoundSurfaceActive,
      startSpontaneousRound,
      acceptSpontaneousRound,
      leaveSpontaneousRound,
    }),
    [
      joinedRoomIds,
      actor,
      commitRooms,
      findRoom,
      getMessages,
      getUnreadCount,
      messagesByRoom,
      pendingByRoom,
      deliverPending,
      groupOpenings,
      fireAndForget,
      joinActivity,
      leaveRoom,
      createGroup,
      openRoom,
      closeRoom,
      spontaneousRound,
      startSpontaneousRound,
      acceptSpontaneousRound,
      leaveSpontaneousRound,
    ],
  );

  return (
    <ChatActivityContext.Provider value={activityValue}>
      <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
    </ChatActivityContext.Provider>
  );
}
