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
import { useCircles } from '@/features/circles';
import { useFriends } from '@/features/friends';
import { useSyncOutbox } from '@/features/sync';
import type { ActivityCategory, ActivityMode } from '@/domain/activity';
import type { GeoCoordinate } from '@/domain/geo';
import type { ParticipantPreview } from '@/domain/person';
import type { Plan, PlanPerson } from '@/features/calendar';
import { formatTimeRange } from '@/features/calendar/utils/formatPlanTime';
import type {
  ActivitySelectionPreview,
  MapMarker,
  MapSelection,
  MarkerCluster,
} from '@/features/map/types/map.types';

import { activityService } from './services/activityService';
import type {
  ActivityActor,
  ActivityCreation,
  ActivityDoc,
} from './services/activityService.types';
import { resolveActivityMode } from './utils/activityMode';
import { isActivityLive } from './utils/activityLifecycle';
import { recordCoParticipants } from './inviteHistory';
import { durationMinutes } from './utils/datetime';
import { createDefaultVisibility } from './utils/modeDefaults';
import type { ActivityDraft } from './types';

// Activities only need minute-level precision: mode transitions, time labels
// and the coarse countdown ring never benefit from a 30-second UI rebuild.
// This is local state only — it never causes a Firestore read or write.
const MODE_TICK_MS = 60_000;

// How long an optimistic activity may live after its write succeeded without the
// feed listener echoing it back. Generous — the echo is normally sub-second.
const TWIN_MAX_LIFETIME_MS = 10_000;

export interface ActivityInfo {
  id: string;
  title: string;
  mode: ActivityMode;
  /**
   * The stored, unresolved mode from the backing document. `mode` above may
   * have been auto-advanced from `soon` to `now`; this one never is, so it is
   * the only way to tell a spontaneous activity from a planned one that has
   * started. Undefined when no document backs the entity.
   */
  plannedMode?: ActivityMode;
  timeLabel?: string;
  placeLabel?: string;
  participantCount: number;
  participants: ParticipantPreview[];
  /** Max participants incl. host; undefined = unbegrenzt. */
  maxParticipants?: number;
  /** Host opt-in: participants may invite their OWN confirmed friends. */
  guestInvitesEnabled?: boolean;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  targetCoordinate?: GeoCoordinate;
  /** Uid of the creator — drives the "Bearbeiten" affordance (host-only). */
  hostId?: string;
}

export interface ActivityUpdate {
  title?: string;
  mode?: ActivityMode;
  startsAt?: string;
  endsAt?: string;
  place?: ActivityDoc['place'] | null;
  description?: string | null;
  /** null removes the limit; undefined leaves it unchanged. */
  maxParticipants?: number | null;
  /** null removes the category; undefined leaves it unchanged. */
  category?: ActivityCategory | null;
  /** Host toggle for participant guest invites; undefined leaves it unchanged. */
  guestInvitesEnabled?: boolean;
}

interface ActivityEntityContextValue {
  /** True after the bounded feed listener delivered its first snapshot. */
  initialFeedReady: boolean;
  mapMarkers: MapMarker[];
  markerClusters: MarkerCluster[];
  plans: Plan[];
  findActivityById: (id: string) => ActivityInfo | null;
  markerToSelection: (marker: MapMarker) => MapSelection;
  clusterToSelection: (cluster: MarkerCluster) => MapSelection;
  planToSelection: (plan: Plan) => MapSelection;
  createActivityFromDraft: (draft: ActivityDraft, preferredId?: string) => ActivityCreation;
  updateActivity: (id: string, update: ActivityUpdate) => Promise<void>;
  /** Adds the current user to an activity's participants. */
  joinActivity: (id: string) => Promise<boolean>;
  cancelActivity: (id: string) => Promise<void>;
  leaveActivity: (id: string) => Promise<boolean>;
  /** Participant-vouched guest invite (host opt-in, server-checked). */
  inviteFriendToActivity: (id: string, targetUid: string) => Promise<'invited' | 'already_invited'>;
  /** Builds a prefilled draft for a current user's active activity. */
  getEditableDraft: (id: string) => ActivityDraft | null;
  updateActivityFromDraft: (id: string, draft: ActivityDraft) => Promise<void>;
}

const ActivityEntityContext = createContext<ActivityEntityContextValue | null>(null);

function planActivityId(plan: Plan) {
  return plan.activityId ?? plan.id;
}

function planPeopleToAvatars(people: PlanPerson[]): ParticipantPreview[] {
  return people.map((person) => ({
    userId: person.id,
    displayName: person.displayName,
    initials: person.initials,
    avatarUrl: person.avatarUrl,
  }));
}

function markerParticipants(marker: MapMarker): ParticipantPreview[] {
  if (marker.avatars?.length) return marker.avatars;

  return [
    {
      userId: marker.userId,
      displayName: marker.displayName,
      initials: marker.initials,
      avatarUrl: marker.avatarUrl,
      mode: marker.mode,
    },
  ];
}

function modeFromPlan(plan: Plan, fallback: ActivityMode = 'soon'): ActivityMode {
  return plan.sourceMode === 'open' ? fallback : (plan.sourceMode ?? fallback);
}

function planPlaceLabel(plan: Plan) {
  return plan.locationName && plan.address
    ? `${plan.locationName} · ${plan.address}`
    : plan.locationName;
}

function mapSelectionFromInfo(
  info: ActivityInfo,
  type: 'Avatar' | 'Cluster' = 'Cluster',
): MapSelection {
  const base: ActivitySelectionPreview = {
    id: info.id,
    title: info.title,
    subtitle: info.description ?? `${info.participantCount} Teilnehmer`,
    mode: info.mode,
    plannedMode: info.plannedMode,
    participantCount: info.participantCount,
    participants: info.participants,
    maxParticipants: info.maxParticipants,
    targetCoordinate: info.targetCoordinate,
    timeLabel: info.timeLabel,
    placeLabel: info.placeLabel,
    startsAt: info.startsAt,
    endsAt: info.endsAt,
    hostId: info.hostId,
    guestInvitesEnabled: info.guestInvitesEnabled,
  };

  if (type === 'Avatar') {
    return {
      ...base,
      type: 'Avatar',
      hostName: info.participants[0]?.displayName ?? info.title,
    };
  }

  return { ...base, type: 'Cluster' };
}

function draftPlaceLabel(draft: ActivityDraft) {
  return (
    draft.place?.name ?? (draft.locationChoice === 'current' ? 'Aktueller Standort' : undefined)
  );
}

function samePlace(left: ActivityDoc['place'] | undefined, right: ActivityDoc['place'] | null) {
  if (!left || !right) return !left && !right;
  if (left.label !== right.label || left.visibility !== right.visibility) return false;
  if (left.visibility === 'none' || right.visibility === 'none') return true;
  return left.latitude === right.latitude && left.longitude === right.longitude;
}

function activityPlaceFromDraft(
  draft: ActivityDraft,
  label: string,
): NonNullable<ActivityDoc['place']> {
  const latitude = draft.place?.latitude;
  const longitude = draft.place?.longitude;
  return latitude != null && longitude != null
    ? { label, latitude, longitude, visibility: 'pin' }
    : { label, visibility: 'none' };
}

const EMPTY_MARKER_CLUSTERS: MarkerCluster[] = [];

function queuedActivityToDoc(
  operation: ReturnType<typeof useSyncOutbox>['operations'][number],
): ActivityDoc | null {
  if (operation.kind !== 'activity.create' || operation.status !== 'queued') return null;
  const { audienceContext: _audienceContext, ...activity } = operation.payload.activity;
  return {
    ...activity,
    id: operation.payload.activityId,
    hostId: activity.participants[0]?.uid ?? operation.accountId,
    status: 'active' as const,
    createdAt: operation.createdAt,
  } satisfies ActivityDoc;
}

/** Persisted activity document to its calendar projection. */
function docToPlan(doc: ActivityDoc, now: number): Plan {
  const mode = resolveActivityMode(doc.mode, doc.startsAt, now);
  return {
    id: `plan-${doc.id}`,
    activityId: doc.id,
    title: doc.title,
    status: mode === 'now' ? 'confirmed' : 'tentative',
    startsAt: doc.startsAt ?? new Date(doc.createdAt).toISOString(),
    endsAt: doc.endsAt,
    locationName: doc.place?.label,
    sourceMode: mode,
    description: doc.note,
    people: doc.participants.map((p) => ({
      id: p.uid,
      displayName: p.displayName,
      initials: p.initials,
    })),
  };
}

/** Persisted activity doc → map marker (only when it has a visible place). */
function docToMarker(doc: ActivityDoc, now: number): MapMarker | null {
  if (
    !doc.place?.label ||
    doc.place.visibility !== 'pin' ||
    doc.place.latitude == null ||
    doc.place.longitude == null
  ) {
    return null;
  }
  const host = doc.participants[0];
  return {
    id: doc.id,
    userId: doc.hostId,
    displayName: host?.displayName ?? 'Du',
    initials: host?.initials ?? 'DU',
    mode: resolveActivityMode(doc.mode, doc.startsAt, now),
    label: doc.place.label,
    title: doc.title,
    timeLabel: doc.startsAt ? formatTimeRange(doc.startsAt, doc.endsAt) : undefined,
    placeLabel: doc.place.label,
    avatars: doc.participants.map((participant) => ({
      userId: participant.uid,
      displayName: participant.displayName,
      initials: participant.initials,
    })),
    participantCount: doc.participants.length,
    maxParticipants: doc.maxParticipants,
    category: doc.category,
    coordinate: {
      latitude: doc.place.latitude,
      longitude: doc.place.longitude,
    },
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    journeyUnderwayCount: doc.journeyUnderwayCount,
  };
}

export function ActivityEntityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { circles } = useCircles();
  const { friendUids, closeFriendUids } = useFriends();
  const { operations: syncOperations } = useSyncOutbox();
  const actor = useMemo<ActivityActor>(
    () => ({
      uid: user?.id ?? 'u_you',
      displayName: user?.displayName ?? 'Du',
      initials: (user?.displayName ?? 'Du').slice(0, 2).toUpperCase(),
    }),
    [user?.id, user?.displayName],
  );

  const [docs, setDocs] = useState<ActivityDoc[]>([]);
  // Lets the boot gate wait for a real first feed snapshot without guessing
  // from an empty array (an empty feed is a perfectly valid result).
  const [initialFeedReady, setInitialFeedReady] = useState(false);
  // Creation is a CALLABLE, so the feed listener only echoes a new activity a
  // full server round-trip later (cold start included). Until then the app has
  // no entity to show — no pin to throw, no plan, nothing. These local twins
  // bridge exactly that gap and are dropped the moment the real doc lands or
  // the write fails. They are never persisted and never read from.
  const [pendingDocs, setPendingDocs] = useState<ActivityDoc[]>([]);
  const queuedActivityIdsRef = useRef<Set<string>>(new Set());
  const activeAccountUidRef = useRef(actor.uid);
  activeAccountUidRef.current = actor.uid;
  // Cancellation is optimistic for the same reason: the tap is the decision, the
  // callable is only its bookkeeping. Ids here are hidden everywhere at once and
  // put back if the write fails.
  const [cancellingIds, setCancellingIds] = useState<string[]>([]);

  // The one bounded activity-feed listener.
  useEffect(() => {
    const accountUid = actor.uid;
    setDocs([]);
    setInitialFeedReady(false);
    setPendingDocs([]);
    setCancellingIds([]);
    return activityService.subscribeActivities(actor, (next) => {
      if (activeAccountUidRef.current !== accountUid) return;
      setDocs(next);
      setInitialFeedReady(true);
    });
  }, [actor]);

  // Hold the hide until the feed agrees the activity is no longer active —
  // dropping it earlier would flash the cancelled pin back onto the map.
  useEffect(() => {
    if (cancellingIds.length === 0) return;
    const settled = cancellingIds.filter((id) => {
      const doc = docs.find((item) => item.id === id);
      return !doc || doc.status !== 'active';
    });
    if (settled.length === 0) return;
    setCancellingIds((current) => current.filter((id) => !settled.includes(id)));
  }, [cancellingIds, docs]);

  // The server feed is always authoritative: once it knows the id, the twin goes.
  useEffect(() => {
    if (pendingDocs.length === 0) return;
    const known = new Set(docs.map((doc) => doc.id));
    if (!pendingDocs.some((doc) => known.has(doc.id))) return;
    setPendingDocs((current) => current.filter((doc) => !known.has(doc.id)));
  }, [docs, pendingDocs]);

  // Persisted activity creates restore the same immediate local entity after a
  // restart. The server feed remains authoritative and removes the twin as
  // soon as it arrives; a short fallback prevents a stale local pin if the
  // callable is permanently rejected after reconnecting.
  useEffect(() => {
    const queued = syncOperations
      .filter((operation) => operation.accountId === actor.uid)
      .map(queuedActivityToDoc)
      .filter((doc): doc is ActivityDoc => doc !== null);
    const nextIds = new Set(queued.map((doc) => doc.id));
    const settledIds = [...queuedActivityIdsRef.current].filter((id) => !nextIds.has(id));
    queuedActivityIdsRef.current = nextIds;
    setPendingDocs((current) => [...current.filter((doc) => !nextIds.has(doc.id)), ...queued]);
    if (settledIds.length) {
      setTimeout(() => {
        setPendingDocs((current) => current.filter((doc) => !settledIds.includes(doc.id)));
      }, TWIN_MAX_LIFETIME_MS);
    }
  }, [actor.uid, syncOperations]);

  const activityDocs = useMemo(() => {
    const known = new Set(docs.map((doc) => doc.id));
    const merged =
      pendingDocs.length === 0
        ? docs
        : [...docs, ...pendingDocs.filter((doc) => !known.has(doc.id))];
    if (cancellingIds.length === 0) return merged;
    return merged.filter((doc) => !cancellingIds.includes(doc.id));
  }, [cancellingIds, docs, pendingDocs]);

  // Ticks periodically so "soon" activities flip to "now" live, on screen,
  // once their start time passes — without requiring a reload or re-navigation.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MODE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // The document remains available for its short-lived activity chat after it
  // ends, but it must no longer occupy the map or calendar. This is local
  // derivation only; it adds neither reads nor writes.
  const liveDocs = useMemo(
    () => activityDocs.filter((doc) => isActivityLive(doc, now)),
    [activityDocs, now],
  );

  // Local suggestion data is derived only from actual, still-live
  // co-participants. It stays on this device and never creates a backend read
  // or write.
  useEffect(() => {
    liveDocs.forEach((doc) => {
      if (!doc.participantUids.includes(actor.uid) || doc.participantUids.length < 2) return;
      void recordCoParticipants(doc.id, actor.uid, doc.participantUids);
    });
  }, [liveDocs, actor.uid]);

  const docMarkers = useMemo(
    () => liveDocs.map((doc) => docToMarker(doc, now)).filter((m): m is MapMarker => m !== null),
    [liveDocs, now],
  );
  const docPlans = useMemo(() => liveDocs.map((doc) => docToPlan(doc, now)), [liveDocs, now]);

  const plans = useMemo(
    () =>
      docPlans.map((plan) => ({
        ...plan,
        sourceMode: plan.sourceMode
          ? resolveActivityMode(plan.sourceMode, plan.startsAt, now)
          : plan.sourceMode,
      })),
    [docPlans, now],
  );

  // The map only shows `now` and `soon` activities — `open` is presence, not a
  // map pin (see AGENTS.md; rejected: blue open pins). Each marker receives the
  // same complete participant list and count used by the detail sheet.
  const mapMarkers = useMemo(() => {
    return docMarkers
      .map((marker) => {
        const participants = markerParticipants(marker);
        return {
          ...marker,
          avatars: participants,
          participantCount: Math.max(marker.participantCount ?? 0, participants.length, 1),
          mode: resolveActivityMode(marker.mode, marker.startsAt, now),
        };
      })
      .filter((marker) => marker.mode !== 'open');
  }, [docMarkers, now]);

  const markerClusters = EMPTY_MARKER_CLUSTERS;

  const findActivityById = useCallback(
    (id: string): ActivityInfo | null => {
      const plan = plans.find((item) => planActivityId(item) === id || item.id === id);
      const marker = mapMarkers.find((item) => item.id === id);
      const cluster = markerClusters.find((item) => item.id === id);
      const backingDoc = activityDocs.find((doc) => doc.id === id);
      const hostId = backingDoc?.hostId;
      // Straight off the document, never through resolveActivityMode — see
      // ActivityInfo.plannedMode. It is what decides whether Anreise exists.
      const plannedMode = backingDoc?.mode;
      const guestInvitesEnabled = backingDoc?.guestInvitesEnabled === true || undefined;
      const maxParticipants =
        backingDoc?.maxParticipants ?? marker?.maxParticipants ?? cluster?.maxParticipants;

      if (cluster) {
        const participants = backingDoc
          ? backingDoc.participants.map((participant) => ({
              userId: participant.uid,
              displayName: participant.displayName,
              initials: participant.initials,
            }))
          : cluster.avatars;
        return {
          id,
          title: plan?.title ?? cluster.label,
          mode: plan ? modeFromPlan(plan, cluster.mode) : cluster.mode,
          plannedMode,
          timeLabel: plan ? formatTimeRange(plan.startsAt, plan.endsAt) : undefined,
          placeLabel: plan ? planPlaceLabel(plan) : undefined,
          participantCount: Math.max(cluster.count, participants.length),
          participants,
          maxParticipants,
          description: plan?.description,
          startsAt: plan?.startsAt,
          endsAt: plan?.endsAt,
          targetCoordinate: cluster.coordinate,
          hostId,
          guestInvitesEnabled,
        };
      }

      if (marker) {
        const participants = markerParticipants(marker);
        return {
          id,
          title: marker.title ?? plan?.title ?? marker.label ?? marker.displayName,
          mode: marker.mode,
          plannedMode,
          timeLabel:
            marker.timeLabel ?? (plan ? formatTimeRange(plan.startsAt, plan.endsAt) : undefined),
          placeLabel: marker.placeLabel ?? (plan ? planPlaceLabel(plan) : marker.label),
          participantCount: Math.max(marker.participantCount ?? 0, participants.length, 1),
          participants,
          maxParticipants,
          description: plan?.description,
          startsAt: marker.startsAt ?? plan?.startsAt,
          endsAt: marker.endsAt ?? plan?.endsAt,
          targetCoordinate: marker.coordinate,
          hostId,
          guestInvitesEnabled,
        };
      }

      if (plan) {
        const participants = planPeopleToAvatars(plan.people);
        return {
          id: planActivityId(plan),
          title: plan.title,
          mode: modeFromPlan(plan),
          plannedMode,
          timeLabel: formatTimeRange(plan.startsAt, plan.endsAt),
          placeLabel: planPlaceLabel(plan),
          participantCount: participants.length,
          participants,
          maxParticipants,
          description: plan.description,
          startsAt: plan.startsAt,
          endsAt: plan.endsAt,
          hostId,
          guestInvitesEnabled,
        };
      }

      return null;
    },
    [mapMarkers, markerClusters, plans, activityDocs],
  );

  const markerToSelection = useCallback(
    (marker: MapMarker): MapSelection =>
      mapSelectionFromInfo(
        findActivityById(marker.id) ?? {
          id: marker.id,
          title: marker.title ?? marker.label ?? marker.displayName,
          mode: marker.mode,
          timeLabel: marker.timeLabel,
          placeLabel: marker.placeLabel ?? marker.label,
          participantCount: Math.max(
            marker.participantCount ?? 0,
            markerParticipants(marker).length,
            1,
          ),
          participants: markerParticipants(marker),
          targetCoordinate: marker.coordinate,
        },
        'Avatar',
      ),
    [findActivityById],
  );

  const clusterToSelection = useCallback(
    (cluster: MarkerCluster): MapSelection =>
      mapSelectionFromInfo(
        findActivityById(cluster.id) ?? {
          id: cluster.id,
          title: cluster.label,
          mode: cluster.mode,
          participantCount: cluster.count,
          participants: cluster.avatars,
          maxParticipants: cluster.maxParticipants,
          targetCoordinate: cluster.coordinate,
        },
        'Cluster',
      ),
    [findActivityById],
  );

  const planToSelection = useCallback(
    (plan: Plan): MapSelection => {
      const id = planActivityId(plan);
      const info = findActivityById(id) ?? {
        id,
        title: plan.title,
        mode: modeFromPlan(plan),
        timeLabel: formatTimeRange(plan.startsAt, plan.endsAt),
        placeLabel: planPlaceLabel(plan),
        participantCount: plan.people.length,
        participants: planPeopleToAvatars(plan.people),
        description: plan.description,
      };

      return mapSelectionFromInfo(info, 'Cluster');
    },
    [findActivityById],
  );

  // A concrete Activity has exactly one visibility context. Groups are private
  // shortcuts, never shared group entities; the callable independently derives
  // and validates the same audience in its server-side callable.
  const resolveAudience = useCallback(
    (visibility: ActivityDraft['visibility']): string[] => {
      const audience = new Set<string>([actor.uid]);
      if (visibility.kind === 'all_friends') {
        friendUids.forEach((id) => audience.add(id));
      } else if (visibility.kind === 'close_friends') {
        closeFriendUids.filter((id) => friendUids.includes(id)).forEach((id) => audience.add(id));
      } else {
        circles
          .find((circle) => circle.id === visibility.groupId)
          ?.friendUids.filter((id) => friendUids.includes(id))
          .forEach((id) => audience.add(id));
      }
      return [...audience];
    },
    [actor.uid, circles, closeFriendUids, friendUids],
  );

  const createActivityFromDraft = useCallback(
    (draft: ActivityDraft, preferredId?: string) => {
      const title = draft.title?.trim() || 'Activity';
      const mode = draft.mode === 'open' ? 'soon' : draft.mode;
      const placeLabel = draftPlaceLabel(draft);
      const input = {
        mode,
        title,
        note: draft.description?.trim() || undefined,
        audienceUids: resolveAudience(draft.visibility),
        audienceContext: draft.visibility,
        participantUids: [actor.uid],
        startsAt: draft.startsAt ?? new Date().toISOString(),
        endsAt: draft.endsAt,
        place: placeLabel ? activityPlaceFromDraft(draft, placeLabel) : undefined,
        maxParticipants: draft.maxPeople,
        category: draft.category,
        guestInvitesEnabled: draft.guestInvitesEnabled,
        participants: [
          { uid: actor.uid, displayName: actor.displayName, initials: actor.initials },
        ],
      };

      const creation = activityService.createActivity(actor, input, preferredId);

      // Show the activity NOW, under the id the server will use. The callable
      // mirrors these fields back unchanged, so the twin and the real doc agree
      // on everything the map and calendar derive (mode, place, times).
      const optimistic: ActivityDoc = {
        ...input,
        id: creation.id,
        hostId: actor.uid,
        status: 'active',
        createdAt: Date.now(),
      };
      setPendingDocs((current) => [...current.filter((doc) => doc.id !== creation.id), optimistic]);
      const dropTwin = () =>
        setPendingDocs((current) => current.filter((doc) => doc.id !== creation.id));
      // A rejected write takes its twin with it — the alert is the caller's.
      // A resolved one gets a hard expiry too: the feed effect normally removes
      // the twin within a second, and a pin only this device can see must never
      // outlive that.
      creation.ready.then((result) => {
        if (result === 'sent') setTimeout(dropTwin, TWIN_MAX_LIFETIME_MS);
      }, dropTwin);

      return creation;
    },
    [actor, resolveAudience],
  );

  const updateActivity = useCallback(
    async (id: string, update: ActivityUpdate) => {
      const persistedDoc = docs.find((doc) => doc.id === id);
      if (!persistedDoc) {
        throw new Error('Aktivität nicht gefunden.');
      }
      if (persistedDoc.hostId !== actor.uid) {
        throw new Error('Nur der Host kann diese Aktivität bearbeiten.');
      }
      if (!isActivityLive(persistedDoc)) {
        throw new Error('Diese Aktivität ist nicht mehr aktiv.');
      }
      await activityService.updateActivity(actor, id, {
        title: update.title,
        mode: update.mode,
        startsAt: update.startsAt,
        endsAt: update.endsAt,
        note: update.description,
        maxParticipants: update.maxParticipants,
        category: update.category,
        place: update.place,
        guestInvitesEnabled: update.guestInvitesEnabled,
      });
    },
    [actor, docs],
  );

  const joinActivity = useCallback(
    (id: string) => activityService.joinActivity(actor, id),
    [actor],
  );

  const cancelActivity = useCallback(
    async (id: string) => {
      const persistedDoc = docs.find((doc) => doc.id === id);
      if (!persistedDoc) throw new Error('Aktivität nicht gefunden.');
      if (persistedDoc.hostId !== actor.uid) {
        throw new Error('Nur der Host kann diese Aktivität absagen.');
      }
      if (!isActivityLive(persistedDoc)) {
        throw new Error('Diese Aktivität ist nicht mehr aktiv.');
      }

      // Gone from map and calendar NOW; the write runs behind the animation.
      setCancellingIds((current) => (current.includes(id) ? current : [...current, id]));
      try {
        await activityService.cancelActivity(actor, id);
      } catch (error) {
        // Put it back exactly as it was and let the caller explain why.
        setCancellingIds((current) => current.filter((item) => item !== id));
        throw error;
      }
    },
    [actor, docs],
  );

  const leaveActivity = useCallback(
    (id: string) => activityService.leaveActivity(actor, id),
    [actor],
  );

  const inviteFriendToActivity = useCallback(
    (id: string, targetUid: string) => activityService.inviteFriend(actor, id, targetUid),
    [actor],
  );

  // Prefills the composer for active activities owned by the current user.
  const getEditableDraft = useCallback(
    (id: string): ActivityDraft | null => {
      const doc = docs.find((item) => item.id === id);
      if (!doc || doc.hostId !== actor.uid || !isActivityLive(doc)) return null;

      // The STORED mode, not the resolved one. `updateActivityFromDraft` writes
      // `mode` back whenever it differs from the document, so seeding the draft
      // with the display mode meant that fixing a typo on a started `soon`
      // activity silently rewrote it to `now` — permanently, and now that
      // `now` activities have no Anreise at all, that silently stripped a
      // running Anreise off a plan. An edit fixes mistakes; it never changes
      // what kind of activity this is.
      const mode = doc.mode;
      // The display mode still decides how the form READS the time fields: a
      // started activity is presented with its remaining runtime, exactly as
      // before.
      const displayMode = resolveActivityMode(doc.mode, doc.startsAt, Date.now());
      return {
        mode,
        title: doc.title,
        description: doc.note,
        visibility: createDefaultVisibility(),
        place: doc.place
          ? {
              id: `${doc.id}-place`,
              name: doc.place.label,
              latitude: doc.place.visibility === 'pin' ? doc.place.latitude : undefined,
              longitude: doc.place.visibility === 'pin' ? doc.place.longitude : undefined,
              source: 'map',
            }
          : undefined,
        locationChoice: doc.place ? 'map' : 'open',
        locationPrecision: doc.place?.visibility === 'pin' ? 'exact' : 'none',
        startsAt: doc.startsAt,
        endsAt: doc.endsAt,
        plannedDurationMinutes: durationMinutes(doc.startsAt, doc.endsAt),
        expiresInMinutes:
          displayMode === 'now' ? durationMinutes(doc.startsAt, doc.endsAt) : undefined,
        maxPeople: doc.maxParticipants,
        category: doc.category,
        guestInvitesEnabled: doc.guestInvitesEnabled,
      };
    },
    [actor.uid, docs],
  );

  // Audience/visibility is intentionally NOT re-resolved here (ActivityDocUpdate
  // has no audienceUids field) — editing a typo must never silently change who
  // can see the activity. The composer hides the visibility picker in edit mode.
  const updateActivityFromDraft = useCallback(
    async (id: string, draft: ActivityDraft) => {
      const doc = docs.find((item) => item.id === id);
      if (!doc) throw new Error('Aktivität nicht gefunden.');
      if (doc.hostId !== actor.uid) {
        throw new Error('Nur der Host kann diese Aktivität bearbeiten.');
      }
      if (!isActivityLive(doc)) throw new Error('Diese Aktivität ist nicht mehr aktiv.');

      const mode = draft.mode === 'open' ? 'soon' : draft.mode;
      const placeLabel = draftPlaceLabel(draft);
      const title = draft.title?.trim() || 'Activity';
      const description = draft.description?.trim() || null;
      const place: ActivityDoc['place'] | null = placeLabel
        ? activityPlaceFromDraft(draft, placeLabel)
        : null;
      const update: ActivityUpdate = {};

      if (title !== doc.title) update.title = title;
      if (mode !== doc.mode) update.mode = mode;
      if (draft.startsAt !== doc.startsAt) update.startsAt = draft.startsAt;
      if (draft.endsAt !== doc.endsAt) update.endsAt = draft.endsAt;
      if (description !== (doc.note ?? null)) update.description = description;
      if ((draft.maxPeople ?? null) !== (doc.maxParticipants ?? null)) {
        update.maxParticipants = draft.maxPeople ?? null;
      }
      if ((draft.category ?? null) !== (doc.category ?? null)) {
        update.category = draft.category ?? null;
      }
      if ((draft.guestInvitesEnabled ?? false) !== (doc.guestInvitesEnabled ?? false)) {
        update.guestInvitesEnabled = draft.guestInvitesEnabled ?? false;
      }
      if (!samePlace(doc.place, place)) update.place = place;

      if (!Object.keys(update).length) return;
      await updateActivity(id, update);
    },
    [actor.uid, docs, updateActivity],
  );

  const value = useMemo<ActivityEntityContextValue>(
    () => ({
      initialFeedReady,
      mapMarkers,
      markerClusters,
      plans,
      findActivityById,
      markerToSelection,
      clusterToSelection,
      planToSelection,
      createActivityFromDraft,
      updateActivity,
      joinActivity,
      cancelActivity,
      leaveActivity,
      inviteFriendToActivity,
      getEditableDraft,
      updateActivityFromDraft,
    }),
    [
      initialFeedReady,
      mapMarkers,
      markerClusters,
      plans,
      findActivityById,
      markerToSelection,
      clusterToSelection,
      planToSelection,
      createActivityFromDraft,
      updateActivity,
      joinActivity,
      cancelActivity,
      leaveActivity,
      inviteFriendToActivity,
      getEditableDraft,
      updateActivityFromDraft,
    ],
  );

  return <ActivityEntityContext.Provider value={value}>{children}</ActivityEntityContext.Provider>;
}

export function useActivityEntities() {
  const context = useContext(ActivityEntityContext);
  if (!context) {
    throw new Error('useActivityEntities must be used within ActivityEntityProvider');
  }
  return context;
}
