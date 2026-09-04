/** Default window for a one-tap Open action. */
export const OPEN_DURATION_MS = 3 * 60 * 60 * 1000;

/** Hard ceiling that keeps an Open status current and trustworthy. */
export const OPEN_MAX_DURATION_MS = 12 * 60 * 60 * 1000;

/** Shorter gaps are not useful availability windows. */
export const OPEN_MIN_DURATION_MS = 15 * 60 * 1000;

export function constrainOpenExpiry(
  requestedExpiry: number,
  now: number,
  nextActivityStartsAt?: number | null,
): number {
  return Math.min(
    requestedExpiry,
    now + OPEN_MAX_DURATION_MS,
    nextActivityStartsAt && nextActivityStartsAt > now
      ? nextActivityStartsAt
      : Number.POSITIVE_INFINITY,
  );
}
