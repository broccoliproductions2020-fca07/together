import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/features/auth';

import { friendService } from './services/friendService';
import { loadCachedFriendships, saveCachedFriendships } from './services/friendshipCache';
import type {
  FriendActor,
  FriendRequestPolicy,
  FriendRequestTarget,
  FriendProfile,
  PeopleSearchProfile,
  FriendRequest,
  FriendshipDoc,
  SendFriendRequestResult,
} from './services/friendService.types';

interface FriendsContextValue {
  /** Cached relationships were restored, so an empty list is now meaningful. */
  hydrated: boolean;
  friends: FriendProfile[];
  friendUids: string[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  closeFriendUids: string[];
  closeFriends: FriendProfile[];
  /** Preselected Heimweg audience — see FriendSettings.heimwegGroupUids. */
  heimwegGroupUids: string[];
  heimwegGroup: FriendProfile[];
  /** Profile details are intentionally always visible to accepted friends only. */
  profileVisibleToFriendsOnly: true;
  friendRequestPolicy: FriendRequestPolicy;
  /** Whether the 1 h-before "Anreise teilen?" reminder is sent. Absent = on. */
  journeyRemindersEnabled: boolean;
  notificationsSeenAt: number;
  sendFriendRequest: (username: string) => Promise<SendFriendRequestResult>;
  searchPeople: (query: string) => Promise<PeopleSearchProfile[]>;
  sendActivityFriendRequest: (
    targetUid: string,
    activityId: string,
  ) => Promise<SendFriendRequestResult>;
  respondToFriendRequest: (friendshipId: string, accept: boolean) => Promise<void>;
  removeFriend: (uid: string) => Promise<void>;
  toggleCloseFriend: (uid: string) => Promise<void>;
  setHeimwegGroup: (uids: string[]) => Promise<void>;
  setFriendRequestPolicy: (policy: FriendRequestPolicy) => Promise<void>;
  setJourneyRemindersEnabled: (enabled: boolean) => Promise<void>;
}

const FriendsContext = createContext<FriendsContextValue | null>(null);

function otherProfile(doc: FriendshipDoc, actorUid: string): FriendProfile | null {
  const otherUid = doc.participantUids.find((uid) => uid !== actorUid);
  return doc.profiles.find((profile) => profile.uid === otherUid) ?? null;
}

/**
 * Relationships are cache-first and refresh only after the revision on the
 * existing tiny user-settings document changes. Circle membership is absent.
 */
export function FriendsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const actor = useMemo<FriendActor>(
    () => ({
      uid: user?.id ?? 'u_you',
      displayName: user?.displayName ?? 'Du',
      initials: (user?.displayName ?? 'Du').slice(0, 2).toUpperCase(),
      username: user?.username,
    }),
    [user?.id, user?.displayName, user?.username],
  );
  const [relationships, setRelationships] = useState<FriendshipDoc[]>([]);
  const [closeFriendUids, setCloseFriendUids] = useState<string[]>([]);
  const [heimwegGroupUids, setHeimwegGroupUids] = useState<string[]>([]);
  const [friendRequestPolicy, setFriendRequestPolicyState] =
    useState<FriendRequestPolicy>('anyone');
  const [journeyRemindersEnabled, setJourneyRemindersEnabledState] = useState(true);
  const [notificationsSeenAt, setNotificationsSeenAt] = useState(0);
  const [friendshipsVersion, setFriendshipsVersion] = useState(0);
  const [friendshipsHydrated, setFriendshipsHydrated] = useState(false);
  const cacheVersion = useRef<number | null>(null);
  const friendshipRequestVersion = useRef(0);
  const activeAccountUidRef = useRef(actor.uid);
  activeAccountUidRef.current = actor.uid;

  const saveAndSetRelationships = useCallback(
    (next: FriendshipDoc[], version: number) => {
      setRelationships(next);
      cacheVersion.current = version;
      void saveCachedFriendships(actor.uid, version, next);
    },
    [actor.uid],
  );

  const refreshFriendships = useCallback(
    async (version = friendshipsVersion) => {
      const accountUid = actor.uid;
      const requestVersion = ++friendshipRequestVersion.current;
      try {
        const next = await friendService.listFriendships(actor);
        if (
          activeAccountUidRef.current === accountUid &&
          requestVersion === friendshipRequestVersion.current
        ) {
          saveAndSetRelationships(next, version);
        }
      } catch (error) {
        // Keep the last known graph during a transient reconnect failure. A
        // stale friend picker is safer than unexpectedly rendering it empty.
        console.warn('[friends] Aktualisieren fehlgeschlagen:', error);
      }
    },
    [actor, friendshipsVersion, saveAndSetRelationships],
  );

  useEffect(() => {
    const requestVersion = ++friendshipRequestVersion.current;
    setRelationships([]);
    cacheVersion.current = null;
    setFriendshipsHydrated(false);
    void loadCachedFriendships(actor.uid)
      .then((cached) => {
        if (
          activeAccountUidRef.current !== actor.uid ||
          requestVersion !== friendshipRequestVersion.current
        ) {
          return;
        }
        if (cached) {
          setRelationships(cached.relationships);
          cacheVersion.current = cached.version;
        }
      })
      .catch((error) => {
        console.warn('[friends] Lokaler Cache konnte nicht geladen werden:', error);
      })
      .finally(() => {
        if (
          activeAccountUidRef.current === actor.uid &&
          requestVersion === friendshipRequestVersion.current
        ) {
          setFriendshipsHydrated(true);
        }
      });
  }, [actor.uid]);

  useEffect(() => {
    const accountUid = actor.uid;
    setCloseFriendUids([]);
    setHeimwegGroupUids([]);
    setFriendRequestPolicyState('anyone');
    setJourneyRemindersEnabledState(true);
    setNotificationsSeenAt(0);
    return friendService.subscribeSettings(actor, (settings) => {
      if (activeAccountUidRef.current !== accountUid) return;
      setCloseFriendUids(settings.closeFriendUids);
      setHeimwegGroupUids(settings.heimwegGroupUids);
      setFriendRequestPolicyState(settings.friendRequestPolicy);
      setFriendshipsVersion(settings.friendshipsVersion);
      setJourneyRemindersEnabledState(settings.journeyRemindersEnabled);
      setNotificationsSeenAt(settings.notificationsSeenAt);
    });
  }, [actor]);

  useEffect(() => {
    if (!friendshipsHydrated || cacheVersion.current === friendshipsVersion) return;
    void refreshFriendships(friendshipsVersion);
  }, [friendshipsHydrated, friendshipsVersion, refreshFriendships]);

  const { friends, incomingRequests, outgoingRequests } = useMemo(() => {
    const accepted: FriendProfile[] = [];
    const incoming: FriendRequest[] = [];
    const outgoing: FriendRequest[] = [];
    relationships.forEach((doc) => {
      const friend = otherProfile(doc, actor.uid);
      if (!friend) return;
      if (doc.status === 'accepted') {
        accepted.push(friend);
      } else if (doc.requesterUid === actor.uid) {
        outgoing.push({ id: doc.id, friend, direction: 'outgoing', createdAt: doc.createdAt });
      } else {
        incoming.push({ id: doc.id, friend, direction: 'incoming', createdAt: doc.createdAt });
      }
    });
    const byName = (a: FriendProfile, b: FriendProfile) =>
      a.displayName.localeCompare(b.displayName, 'de');
    return {
      friends: accepted.sort(byName),
      incomingRequests: incoming.sort((a, b) => b.createdAt - a.createdAt),
      outgoingRequests: outgoing.sort((a, b) => b.createdAt - a.createdAt),
    };
  }, [relationships, actor.uid]);

  const friendUids = useMemo(() => friends.map((friend) => friend.uid), [friends]);
  const closeFriends = useMemo(
    () => friends.filter((friend) => closeFriendUids.includes(friend.uid)),
    [friends, closeFriendUids],
  );
  // Filtering against the confirmed friend list is what makes the direct
  // client write safe: a removed friend silently drops out of the group, and a
  // forged uid can never appear as a selectable Heimweg recipient.
  const heimwegGroup = useMemo(
    () => friends.filter((friend) => heimwegGroupUids.includes(friend.uid)),
    [friends, heimwegGroupUids],
  );

  const sendFriendRequest = useCallback(
    async (username: string) => {
      const result = await friendService.sendFriendRequest(actor, {
        kind: 'username',
        username,
      } satisfies FriendRequestTarget);
      await refreshFriendships();
      return result;
    },
    [actor, refreshFriendships],
  );
  const searchPeople = useCallback(
    (query: string) => friendService.searchPeople(actor, query),
    [actor],
  );
  const sendActivityFriendRequest = useCallback(
    async (targetUid: string, activityId: string) => {
      const result = await friendService.sendFriendRequest(actor, {
        kind: 'shared_activity',
        targetUid,
        activityId,
      } satisfies FriendRequestTarget);
      await refreshFriendships();
      return result;
    },
    [actor, refreshFriendships],
  );
  const respondToFriendRequest = useCallback(
    async (friendshipId: string, accept: boolean) => {
      await friendService.respondToFriendRequest(actor, friendshipId, accept);
      await refreshFriendships();
    },
    [actor, refreshFriendships],
  );
  const removeFriend = useCallback(
    async (uid: string) => {
      await friendService.removeFriend(actor, uid);
      await refreshFriendships();
    },
    [actor, refreshFriendships],
  );
  const toggleCloseFriend = useCallback(
    (uid: string) => friendService.setCloseFriend(actor, uid, !closeFriendUids.includes(uid)),
    [actor, closeFriendUids],
  );
  const setHeimwegGroup = useCallback(
    async (uids: string[]) => {
      const accountUid = actor.uid;
      const previous = heimwegGroupUids;
      setHeimwegGroupUids(uids); // optimistic — the listener confirms it
      try {
        await friendService.setHeimwegGroup(actor, uids);
      } catch (error) {
        if (activeAccountUidRef.current === accountUid) setHeimwegGroupUids(previous);
        throw error;
      }
    },
    [actor, heimwegGroupUids],
  );
  const setFriendRequestPolicy = useCallback(
    async (policy: FriendRequestPolicy) => {
      const accountUid = actor.uid;
      const previous = friendRequestPolicy;
      setFriendRequestPolicyState(policy);
      try {
        await friendService.setFriendRequestPolicy(actor, policy);
      } catch (error) {
        if (activeAccountUidRef.current === accountUid) setFriendRequestPolicyState(previous);
        throw error;
      }
    },
    [actor, friendRequestPolicy],
  );
  const setJourneyRemindersEnabled = useCallback(
    async (enabled: boolean) => {
      const accountUid = actor.uid;
      const previous = journeyRemindersEnabled;
      setJourneyRemindersEnabledState(enabled);
      try {
        await friendService.setJourneyRemindersEnabled(actor, enabled);
      } catch (error) {
        if (activeAccountUidRef.current === accountUid) {
          setJourneyRemindersEnabledState(previous);
        }
        throw error;
      }
    },
    [actor, journeyRemindersEnabled],
  );

  const value = useMemo<FriendsContextValue>(
    () => ({
      hydrated: friendshipsHydrated,
      friends,
      friendUids,
      incomingRequests,
      outgoingRequests,
      closeFriendUids,
      closeFriends,
      heimwegGroupUids,
      heimwegGroup,
      profileVisibleToFriendsOnly: true,
      friendRequestPolicy,
      journeyRemindersEnabled,
      notificationsSeenAt,
      sendFriendRequest,
      searchPeople,
      sendActivityFriendRequest,
      respondToFriendRequest,
      removeFriend,
      toggleCloseFriend,
      setHeimwegGroup,
      setFriendRequestPolicy,
      setJourneyRemindersEnabled,
    }),
    [
      friendshipsHydrated,
      friends,
      friendUids,
      incomingRequests,
      outgoingRequests,
      closeFriendUids,
      closeFriends,
      heimwegGroupUids,
      heimwegGroup,
      friendRequestPolicy,
      journeyRemindersEnabled,
      notificationsSeenAt,
      sendFriendRequest,
      searchPeople,
      sendActivityFriendRequest,
      respondToFriendRequest,
      removeFriend,
      toggleCloseFriend,
      setHeimwegGroup,
      setFriendRequestPolicy,
      setJourneyRemindersEnabled,
    ],
  );

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends() {
  const context = useContext(FriendsContext);
  if (!context) throw new Error('useFriends must be used within FriendsProvider');
  return context;
}
