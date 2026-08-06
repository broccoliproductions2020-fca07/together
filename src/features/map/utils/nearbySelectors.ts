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

/**
 * How the list is ORDERED — and, deliberately, the only thing the app is
 * allowed to infer.
 *
 * The rule: the app may sort, it may never interpret. It must never claim two
 * people "fit together", never propose who should meet whom, never read a vibe
 * as a category it can match on. It cannot know whether someone wants coffee,
 * a run, or to be left alone; only the people involved know that. So the count
 * stays the neutral headline ("N Freunde sind gerade offen") and this only
 * decides who is easiest to act on FIRST.
 *
 * Three inputs, all of them either physics or something the person volunteered:
 *  - proximity — the only hard fact; someone 400 m away is genuinely easier to
 *    meet than someone 8 km away.
 *  - a stated vibe — they took the trouble to write what they are up for, which
 *    makes them actionable. The TEXT is never parsed; only its presence counts.
 *  - shared history — people you have actually done things with, from the
 *    on-device co-participation log (`inviteHistory`). Never a friend graph
 *    fetch, never a "mutual friends" server query.
 *
 * Ties break on distance, then on name, so the order is stable between renders
 * instead of shuffling under the user's thumb.
 */
export interface NearbyRankingContext {
  /** Uids you have actually shared activities with (useFrequentPeople). */
  affinityUids?: string[];
  /** Uids marked as close friends — an explicit statement, so it outranks history. */
  closeFriendUids?: string[];
}

const VIBE_WEIGHT = 0.3;
const AFFINITY_WEIGHT = 0.35;
const CLOSE_FRIEND_WEIGHT = 0.45;

export function rankNearbyScore(
  friend: NearbyFriend,
  radiusKm: number,
  context: NearbyRankingContext = {},
): number {
  const distance = friend.distanceKm ?? radiusKm;
  // 1 at your feet, 0 at the edge of the radius. Radius 0 would divide by zero.
  const proximity = radiusKm > 0 ? Math.max(0, 1 - Math.min(distance / radiusKm, 1)) : 0;
  const vibe = friend.vibeLabel?.trim() ? VIBE_WEIGHT : 0;
  const affinity = context.affinityUids?.includes(friend.id) ? AFFINITY_WEIGHT : 0;
  const close = context.closeFriendUids?.includes(friend.id) ? CLOSE_FRIEND_WEIGHT : 0;
  return proximity + vibe + affinity + close;
}

/** Friends who count as "in deiner Nähe": visible pins within radius, ranked. */
export function selectNearbyFriends(
  friends: NearbyFriend[],
  radiusKm: number,
  context: NearbyRankingContext = {},
): NearbyFriend[] {
  return friends
    .filter((f) => f.locationVisibility === 'pin' && (f.distanceKm ?? Infinity) <= radiusKm)
    .sort((a, b) => {
      const byScore = rankNearbyScore(b, radiusKm, context) - rankNearbyScore(a, radiusKm, context);
      if (Math.abs(byScore) > 0.0001) return byScore;
      const byDistance = (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
      if (byDistance !== 0) return byDistance;
      return a.displayName.localeCompare(b.displayName, 'de');
    });
}

/** Open friends without any location basis — always shown, never counted as nearby.
 * No distance exists here, so the order is the same ranking minus its physics. */
export function selectFriendsWithoutLocation(
  friends: NearbyFriend[],
  context: NearbyRankingContext = {},
): NearbyFriend[] {
  return friends
    .filter((f) => f.locationVisibility === 'none')
    .sort((a, b) => {
      const byScore = rankNearbyScore(b, 0, context) - rankNearbyScore(a, 0, context);
      if (Math.abs(byScore) > 0.0001) return byScore;
      return a.displayName.localeCompare(b.displayName, 'de');
    });
}

/** The single number shown on the pill AND as the sheet's "in deiner Nähe" count. */
export function selectNearbyCount(friends: NearbyFriend[], radiusKm: number): number {
  return selectNearbyFriends(friends, radiusKm).length;
}
