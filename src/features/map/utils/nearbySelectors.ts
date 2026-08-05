import type { NearbyFriend } from '../types/map.types';

/**
 * SINGLE SOURCE OF TRUTH for the "offen in deiner Nähe" logic.
 *
 * Design principle: the bottom-pill number is a SOCIAL-RELEVANCE signal, not a
 * map-search result. It is based purely on WHO is open and near ME (radius
 * around my location) — it does NOT depend on the visible map region and does
 * NOT change when the user zooms or pans the map.
 *
 * "Nearby" = friends with a visible pin within the radius. `none` friends have
 * no location basis and are NEVER counted as nearby; they are surfaced
 * separately under "Ohne Standort".
 *
 * The input is the presence-derived friend list (`presenceToNearby`). Keep the
 * filtering rule here instead of re-implementing it in a component.
 */

/** Friends who count as "in deiner Nähe": visible pins within radius, closest first. */
export function selectNearbyFriends(friends: NearbyFriend[], radiusKm: number): NearbyFriend[] {
  return friends
    .filter((f) => f.locationVisibility === 'pin' && (f.distanceKm ?? Infinity) <= radiusKm)
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

/** Open friends without any location basis — always shown, never counted as nearby. */
export function selectFriendsWithoutLocation(friends: NearbyFriend[]): NearbyFriend[] {
  return friends.filter((f) => f.locationVisibility === 'none');
}

/** The single number shown on the pill AND as the sheet's "in deiner Nähe" count. */
export function selectNearbyCount(friends: NearbyFriend[], radiusKm: number): number {
  return selectNearbyFriends(friends, radiusKm).length;
}
