import type { ActivityDraft } from '@/features/activities';

import type { TimePlanCreateInput, TimePlanOfferGroup } from '../types';
import { offerGroupsToWindows } from '../components/PlanningOfferFields';

/** Converts existing composer data without creating an Activity prematurely. */
export function timePlanCreateInputFromDraft(
  draft: ActivityDraft,
  offers: TimePlanOfferGroup[],
): TimePlanCreateInput {
  const label = draft.place?.name ?? (draft.locationChoice === 'current' ? 'Aktueller Standort' : undefined);
  const hasCoordinate = draft.place?.latitude != null && draft.place?.longitude != null;
  return {
    title: draft.title?.trim() || 'Terminfindung',
    visibility: draft.visibility,
    ...(label
      ? {
          place: hasCoordinate
            ? {
                label,
                latitude: draft.place!.latitude!,
                longitude: draft.place!.longitude!,
                visibility: 'pin' as const,
              }
            : { label, visibility: 'none' as const },
        }
      : {}),
    ...(draft.category ? { category: draft.category } : {}),
    ...(draft.maxPeople ? { maxParticipants: draft.maxPeople } : {}),
    ...(draft.guestInvitesEnabled ? { guestInvitesEnabled: true } : {}),
    sourceWindows: offerGroupsToWindows(offers),
  };
}
