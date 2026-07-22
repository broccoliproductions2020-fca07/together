import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { mockMapMarkers, mockMarkerClusters, mockPlans } from '@/data/mock';
import { BACKEND } from '@/shared/services/firebase';
import { useAuth } from '@/features/auth';
import { useCircles } from '@/features/circles';
import { useFriends } from '@/features/friends';
import type { Plan, PlanPerson } from '@/features/calendar';
import { formatTimeRange } from '@/features/calendar/utils/formatPlanTime';
import type {
  ActivityCategory,
  ActivityMode,
  ActivitySelectionPreview,
  MockMapPosition,
  MapMarker,
  MapSelection,
  MarkerAvatar,
  MarkerCluster,
} from '@/features/map/types/map.types';
import {
  coordinateToMockPosition,
  mockPositionToCoordinate,
} from '@/features/map/utils/mockCoordinates';

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

export interface ActivityInfo {
  id: string;
  title: string;
  mode: ActivityMode;
  timeLabel?: string;
  placeLabel?: string;
  participantCount: number;
  participants: MarkerAvatar[];
  /** Max participants incl. host; undefined = unbegrenzt. */
  maxParticipants?: number;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  targetPosition?: MockMapPosition;
  /** Uid of the creator — drives the "Bearbeiten" affordance (host-only). */
  hostId?: string;
}

export interface ActivityUpdate {
  title?: string;
  mode?: ActivityMode;
  startsAt?: string;
  endsAt?: string;
  timeLabel?: string;
  place?: { label?: string; latitude?: number; longitude?: number };
  description?: string;
  /** null removes the limit; undefined leaves it unchanged. */
  maxParticipants?: number | null;
  /** null removes the category; undefined leaves it unchanged. */
  category?: ActivityCategory | null;
}

interface ActivityEntityContextValue {
  mapMarkers: MapMarker[];
  markerClusters: MarkerCluster[];
  plans: Plan[];
  findActivityById: (id: string) => ActivityInfo | null;
  markerToSelection: (marker: MapMarker) => MapSelection;
  clusterToSelection: (cluster: MarkerCluster) => MapSelection;
  planToSelection: (plan: Plan) => MapSelection;
  createActivityFromDraft: (draft: ActivityDraft, preferredId?: string) => ActivityCreation;
  updateActivity: (id: string, update: ActivityUpdate) => void;
  /** Adds the current user to the activity's participants (self-join). Persists
   * for real activities; a no-op on the doc for demo seeds (display is handled
   * optimistically by the caller via chat-join state). */
  joinActivity: (id: string) => Promise<boolean>;
  cancelActivity: (id: string) => void;
  leaveActivity: (id: string) => Promise<boolean>;
  /** Builds a prefilled draft for editing; null when `id` isn't a real, active,
   * self-hosted activity (demo seeds and other people's activities aren't editable). */
  getEditableDraft: (id: string) => ActivityDraft | null;
  updateActivityFromDraft: (id: string, draft: ActivityDraft) => void;
}

const ActivityEntityContext = createContext<ActivityEntityContextValue | null>(null);

function planActivityId(plan: Plan) {
  return plan.activityId ?? plan.id;
}

function planPeopleToAvatars(people: PlanPerson[]): MarkerAvatar[] {
  return people.map((person) => ({
    userId: person.id,
    displayName: person.displayName,
    initials: person.initials,
    avatarUrl: person.avatarUrl,
  }));
}

function markerParticipants(marker: MapMarker): MarkerAvatar[] {
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

/**
 * Legacy mock data stores the host on the map marker and the remaining people
 * on its calendar projection. Real activities already carry everyone on the
 * activity document. Merge both representations once, rather than letting the
 * map, detail sheet and calendar each infer a different participant list.
 */
function participantsForMarker(marker: MapMarker, plan?: Plan): MarkerAvatar[] {
  const seenUserIds = new Set<string>();
  return [...markerParticipants(marker), ...(plan ? planPeopleToAvatars(plan.people) : [])].filter(
    (participant) => {
      if (seenUserIds.has(participant.userId)) return false;
      seenUserIds.add(participant.userId);
      return true;
    },
  );
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
    participantCount: info.participantCount,
    participants: info.participants,
    maxParticipants: info.maxParticipants,
    targetCoordinate: info.targetPosition
      ? mockPositionToCoordinate(info.targetPosition)
      : undefined,
    targetPosition: info.targetPosition,
    timeLabel: info.timeLabel,
    placeLabel: info.placeLabel,
    startsAt: info.startsAt,
    endsAt: info.endsAt,
    hostId: info.hostId,
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

function positionForNewMarker(index: number) {
  return {
    x: Math.min(88, 46 + (index % 5) * 8),
    y: Math.min(84, 38 + Math.floor(index / 5) * 9),
  };
}

/** Persisted activity doc → calendar Plan (same rules as the old local create). */
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
function docToMarker(doc: ActivityDoc, index: number, now: number): MapMarker | null {
  if (!doc.place?.label || doc.place.visibility !== 'pin') return null;
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
    position:
      doc.place.latitude != null && doc.place.longitude != null
        ? coordinateToMockPosition({
            latitude: doc.place.latitude,
            longitude: doc.place.longitude,
          })
        : positionForNewMarker(index),
    hasExactLocation: true,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    journeyUnderwayCount: doc.journeyUnderwayCount,
  };
}

export function ActivityEntityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { circles } = useCircles();
  const { friendUids, closeFriendUids } = useFriends();
  const actor = useMemo<ActivityActor>(
    () => ({
      uid: user?.id ?? 'u_you',
      displayName: user?.displayName ?? 'Du',
      initials: (user?.displayName ?? 'Du').slice(0, 2).toUpperCase(),
    }),
    [user?.id, user?.displayName],
  );

  // Static demo seeds (editable locally, e.g. cluster edits) + persisted docs.
  // Mock mode ONLY: in firebase mode demo content comes from the emulator
  // (`npm run emulators:seed`), never from client-side seeds mixed into real data.
  const [seedMarkers, setSeedMarkers] = useState<MapMarker[]>(() =>
    BACKEND === 'mock' ? mockMapMarkers : [],
  );
  const [seedMarkerClusters, setMarkerClusters] = useState<MarkerCluster[]>(() =>
    BACKEND === 'mock' ? mockMarkerClusters : [],
  );
  const [seedPlans, setSeedPlans] = useState<Plan[]>(() => (BACKEND === 'mock' ? mockPlans : []));
  const [docs, setDocs] = useState<ActivityDoc[]>([]);

  // The one activity-feed listener (service seam: mock emitter or Firestore).
  useEffect(() => {
    setDocs([]);
    return activityService.subscribeActivities(actor, setDocs);
  }, [actor]);

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
  const liveDocs = useMemo(() => docs.filter((doc) => isActivityLive(doc, now)), [docs, now]);

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
    () =>
      liveDocs
        .map((doc, index) => docToMarker(doc, index, now))
        .filter((m): m is MapMarker => m !== null),
    [liveDocs, now],
  );
  const docPlans = useMemo(() => liveDocs.map((doc) => docToPlan(doc, now)), [liveDocs, now]);

  const plans = useMemo(() => {
    const docIds = new Set(docPlans.map((p) => planActivityId(p)));
    return [...docPlans, ...seedPlans.filter((p) => !docIds.has(planActivityId(p)))].map((plan) => {
      const matchingMarker = seedMarkers.find((marker) => marker.id === planActivityId(plan));
      // A map marker is the canonical activity entity. Keep its calendar
      // projection aligned for the few legacy seeds that were authored
      // separately (for example, Lina's bouldering activity).
      const canonicalPlan = matchingMarker
        ? {
            ...plan,
            title: matchingMarker.title ?? plan.title,
            startsAt: matchingMarker.startsAt ?? plan.startsAt,
            endsAt: matchingMarker.endsAt ?? plan.endsAt,
            locationName: matchingMarker.placeLabel ?? plan.locationName,
            sourceMode: matchingMarker.mode,
          }
        : plan;
      return {
        ...canonicalPlan,
        sourceMode: canonicalPlan.sourceMode
          ? resolveActivityMode(canonicalPlan.sourceMode, canonicalPlan.startsAt, now)
          : canonicalPlan.sourceMode,
      };
    });
  }, [docPlans, seedPlans, seedMarkers, now]);

  // The map only shows `now` and `soon` activities — `open` is presence, not a
  // map pin (see AGENTS.md; rejected: blue open pins). Each marker receives the
  // same complete participant list and count used by the detail sheet.
  const mapMarkers = useMemo(() => {
    const docIds = new Set(docMarkers.map((m) => m.id));
    return [...docMarkers, ...seedMarkers.filter((m) => !docIds.has(m.id))]
      .map((marker) => {
        const plan = plans.find(
          (item) => planActivityId(item) === marker.id || item.id === marker.id,
        );
        const participants = participantsForMarker(marker, plan);
        return {
          ...marker,
          avatars: participants,
          participantCount: Math.max(marker.participantCount ?? 0, participants.length, 1),
          mode: resolveActivityMode(marker.mode, marker.startsAt, now),
        };
      })
      .filter((marker) => marker.mode !== 'open');
  }, [docMarkers, seedMarkers, plans, now]);

  const markerClusters = useMemo(
    () =>
      seedMarkerClusters
        .map((cluster) => ({
          ...cluster,
          mode: resolveActivityMode(cluster.mode, cluster.startsAt, now),
        }))
        .filter((cluster) => cluster.mode !== 'open'),
    [seedMarkerClusters, now],
  );

  const findActivityById = useCallback(
    (id: string): ActivityInfo | null => {
      const plan = plans.find((item) => planActivityId(item) === id || item.id === id);
      const marker = mapMarkers.find((item) => item.id === id);
      const cluster = markerClusters.find((item) => item.id === id);
      const backingDoc = docs.find((doc) => doc.id === id);
      const hostId = backingDoc?.hostId;
      const maxParticipants =
        backingDoc?.maxParticipants ?? marker?.maxParticipants ?? cluster?.maxParticipants;

      if (cluster) {
        // A cluster is already the activity-group representation and carries
        // the complete participant list in mock mode. Do not replace it with
        // the smaller calendar seed list; that made the detail sheet show a
        // lower subset than the marker count promised.
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
          timeLabel: plan ? formatTimeRange(plan.startsAt, plan.endsAt) : undefined,
          placeLabel: plan ? planPlaceLabel(plan) : undefined,
          participantCount: Math.max(cluster.count, participants.length),
          participants,
          maxParticipants,
          description: plan?.description,
          startsAt: plan?.startsAt,
          endsAt: plan?.endsAt,
          targetPosition: cluster.position,
          hostId,
        };
      }

      if (marker) {
        const participants = participantsForMarker(marker, plan);
        return {
          id,
          title: marker.title ?? plan?.title ?? marker.label ?? marker.displayName,
          mode: marker.mode,
          timeLabel:
            marker.timeLabel ?? (plan ? formatTimeRange(plan.startsAt, plan.endsAt) : undefined),
          placeLabel: marker.placeLabel ?? (plan ? planPlaceLabel(plan) : marker.label),
          participantCount: Math.max(marker.participantCount ?? 0, participants.length, 1),
          participants,
          maxParticipants,
          description: plan?.description,
          startsAt: marker.startsAt ?? plan?.startsAt,
          endsAt: marker.endsAt ?? plan?.endsAt,
          targetPosition: marker.position,
          hostId,
        };
      }

      if (plan) {
        const participants = planPeopleToAvatars(plan.people);
        return {
          id: planActivityId(plan),
          title: plan.title,
          mode: modeFromPlan(plan),
          timeLabel: formatTimeRange(plan.startsAt, plan.endsAt),
          placeLabel: planPlaceLabel(plan),
          participantCount: participants.length,
          participants,
          maxParticipants,
          description: plan.description,
          startsAt: plan.startsAt,
          endsAt: plan.endsAt,
          hostId,
        };
      }

      return null;
    },
    [mapMarkers, markerClusters, plans, docs],
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
          targetPosition: marker.position,
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
          targetPosition: cluster.position,
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
  // and validates the same audience in Firebase mode.
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

      return activityService.createActivity(
        actor,
        {
          mode,
          title,
          note: draft.description?.trim() || undefined,
          audienceUids: resolveAudience(draft.visibility),
          audienceContext: draft.visibility,
          participantUids: [actor.uid],
          startsAt: draft.startsAt ?? new Date().toISOString(),
          endsAt: draft.endsAt,
          place: placeLabel
            ? {
                label: placeLabel,
                latitude: draft.place?.latitude,
                longitude: draft.place?.longitude,
                visibility: 'pin',
              }
            : undefined,
          maxParticipants: draft.maxPeople,
          category: draft.category,
          participants: [
            { uid: actor.uid, displayName: actor.displayName, initials: actor.initials },
          ],
        },
        preferredId,
      );
    },
    [actor, resolveAudience],
  );

  const updateActivity = useCallback(
    (id: string, update: ActivityUpdate) => {
      // Persisted activities go through the service…
      const persistedDoc = docs.find((doc) => doc.id === id);
      if (persistedDoc) {
        if (!isActivityLive(persistedDoc)) return;
        activityService.updateActivity(actor, id, {
          title: update.title,
          mode: update.mode,
          startsAt: update.startsAt,
          endsAt: update.endsAt,
          note: update.description,
          maxParticipants: update.maxParticipants,
          category: update.category,
          ...(update.place
            ? {
                place: {
                  ...(persistedDoc.place ?? { visibility: 'pin' as const }),
                  ...update.place,
                },
              }
            : {}),
        });
        return;
      }

      // …demo seeds are patched locally (unchanged legacy behavior).
      setMarkerClusters((current) =>
        current.map((cluster) =>
          cluster.id === id
            ? {
                ...cluster,
                mode: update.mode ?? cluster.mode,
                label: update.title ?? cluster.label,
              }
            : cluster,
        ),
      );

      setSeedMarkers((current) =>
        current.map((marker) =>
          marker.id === id
            ? {
                ...marker,
                mode: update.mode ?? marker.mode,
                title: update.title ?? marker.title,
                label: update.place?.label ?? marker.label,
                timeLabel: update.timeLabel ?? marker.timeLabel,
                placeLabel: update.place?.label ?? marker.placeLabel,
                position:
                  update.place?.latitude != null && update.place?.longitude != null
                    ? coordinateToMockPosition({
                        latitude: update.place.latitude,
                        longitude: update.place.longitude,
                      })
                    : marker.position,
              }
            : marker,
        ),
      );

      setSeedPlans((current) =>
        current.map((plan) =>
          planActivityId(plan) === id || plan.id === id
            ? {
                ...plan,
                title: update.title ?? plan.title,
                startsAt: update.startsAt ?? plan.startsAt,
                endsAt: update.endsAt ?? plan.endsAt,
                locationName: update.place?.label ?? plan.locationName,
                sourceMode: update.mode ?? plan.sourceMode,
                description: update.description ?? plan.description,
              }
            : plan,
        ),
      );
    },
    [actor, docs],
  );

  // Self-join: persist the current user into the activity's participants (real
  // activities only; demo seeds have no doc — the callable would reject with
  // not-found — so their "joined" display stays purely optimistic via the
  // chat-join state in the map screen).
  const joinActivity = useCallback(
    (id: string) => {
      const persistedDoc = docs.find((doc) => doc.id === id);
      if (!persistedDoc) return Promise.resolve(true);
      if (!isActivityLive(persistedDoc)) return Promise.resolve(false);
      return activityService.joinActivity(actor, id);
    },
    [actor, docs],
  );

  const cancelActivity = useCallback(
    (id: string) => {
      const persistedDoc = docs.find((doc) => doc.id === id);
      if (!persistedDoc || !isActivityLive(persistedDoc)) return;
      activityService.cancelActivity(actor, id);
    },
    [actor, docs],
  );

  const leaveActivity = useCallback(
    (id: string) => {
      if (!docs.some((doc) => doc.id === id)) return Promise.resolve(true);
      return activityService.leaveActivity(actor, id);
    },
    [actor, docs],
  );

  // Prefills the composer for editing. Only real, active, self-hosted activities
  // are editable — demo seeds and other people's activities have no backing doc
  // with a matching hostId, so this returns null for them.
  const getEditableDraft = useCallback(
    (id: string): ActivityDraft | null => {
      const doc = docs.find((item) => item.id === id);
      if (!doc || doc.hostId !== actor.uid || !isActivityLive(doc)) return null;

      const mode = resolveActivityMode(doc.mode, doc.startsAt, Date.now());
      return {
        mode,
        title: doc.title,
        description: doc.note,
        visibility: createDefaultVisibility(),
        place: doc.place?.label
          ? {
              id: `${doc.id}-place`,
              name: doc.place.label,
              latitude: doc.place.latitude,
              longitude: doc.place.longitude,
              source: 'map',
            }
          : undefined,
        locationChoice: doc.place ? 'map' : 'current',
        locationPrecision: 'exact',
        startsAt: doc.startsAt,
        endsAt: doc.endsAt,
        plannedDurationMinutes: durationMinutes(doc.startsAt, doc.endsAt),
        expiresInMinutes: mode === 'now' ? durationMinutes(doc.startsAt, doc.endsAt) : undefined,
        maxPeople: doc.maxParticipants,
        category: doc.category,
      };
    },
    [actor.uid, docs],
  );

  // Audience/visibility is intentionally NOT re-resolved here (ActivityDocUpdate
  // has no audienceUids field) — editing a typo must never silently change who
  // can see the activity. The composer hides the visibility picker in edit mode.
  const updateActivityFromDraft = useCallback(
    (id: string, draft: ActivityDraft) => {
      const mode = draft.mode === 'open' ? 'soon' : draft.mode;
      const placeLabel = draftPlaceLabel(draft);

      updateActivity(id, {
        title: draft.title?.trim() || 'Activity',
        mode,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        description: draft.description?.trim() || undefined,
        maxParticipants: draft.maxPeople ?? null,
        category: draft.category ?? null,
        place: placeLabel
          ? {
              label: placeLabel,
              latitude: draft.place?.latitude,
              longitude: draft.place?.longitude,
            }
          : undefined,
      });
    },
    [updateActivity],
  );

  const value = useMemo<ActivityEntityContextValue>(
    () => ({
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
      getEditableDraft,
      updateActivityFromDraft,
    }),
    [
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
