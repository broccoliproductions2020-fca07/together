import type { MapMarker } from '@/features/map/types/map.types';

import type { TimePlan } from '../types';

/**
 * A round on the map.
 *
 * Only a round with a real coordinate can be one: without a place there is
 * nowhere to put it, and it stays reachable through the Postfach instead. That
 * is not a limitation to work around — a pin invents a location, and inventing
 * one for a plan that has none would be worse than showing nothing.
 *
 * The badge carries the TITLE, not a status word. The missing ring and the
 * violet already say "no time fixed yet"; adding "Zeit gesucht" underneath
 * would state in words what the form states, which is the same redundancy the
 * answer cards had.
 */
export function timePlanToMapMarker(plan: TimePlan): MapMarker | null {
  // Only a `pin` place carries a coordinate at all — the type makes that
  // explicit, and it is the same two-tier model as an activity's location:
  // `none` means genuinely no location, so genuinely no marker.
  const place = plan.place;
  if (!place || place.visibility !== 'pin') return null;

  return {
    id: plan.id,
    userId: plan.hostId,
    displayName: plan.hostName,
    initials: plan.hostInitials,
    // `mode` is required on a marker but says nothing here: `planning` turns
    // off every place it is used (ring, glow, countdown). `soon` is what the
    // round becomes once a slot is locked, so it is the least wrong stand-in.
    mode: 'soon',
    planning: true,
    label: plan.title,
    title: plan.title,
    placeLabel: place.label,
    coordinate: { latitude: place.latitude, longitude: place.longitude },
    // One face: the person who asked. Nobody is "dabei" yet — a round collects
    // answers, not participants, and showing four faces would make it look like
    // an activity people have already joined.
    avatars: [
      {
        userId: plan.hostId,
        displayName: plan.hostName,
        initials: plan.hostInitials,
      },
    ],
    participantCount: 1,
    ...(plan.category ? { category: plan.category } : {}),
  };
}

export function timePlansToMapMarkers(plans: TimePlan[]): MapMarker[] {
  return plans.flatMap((plan) => {
    const marker = timePlanToMapMarker(plan);
    return marker ? [marker] : [];
  });
}
