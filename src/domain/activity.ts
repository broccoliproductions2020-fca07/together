/**
 * Domain-level activity concepts. They are shared by the activity, calendar,
 * journey and map features, so they must not be owned by a screen feature.
 */
export type ActivityMode = 'open' | 'soon' | 'now';

/** Optional category chosen for an activity, never inferred from a venue. */
export type ActivityCategory =
  | 'essen'
  | 'drinks'
  | 'kaffee'
  | 'sport'
  | 'outdoor'
  | 'feiern'
  | 'kultur'
  | 'spiele'
  | 'lernen'
  | 'chillen'
  | 'shopping'
  | 'sonstiges';
