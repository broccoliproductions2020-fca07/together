/** Safety-Modus „Heimweg" — see docs/safety-mode.md (binding contract). */

export type SafetyStatus = 'blue' | 'orange' | 'red';
export type SafetyAlertStatus = Exclude<SafetyStatus, 'blue'>;

/** Honest client-visible phases while an explicitly requested Heimweg starts. */
export type SafetyStartPhase = 'permissions' | 'session' | 'location';

export interface SafetyLocation {
  lat: number;
  lng: number;
  /** Epoch ms of the fix — drives the honest "Letztes Update vor …" display. */
  at: number;
}

export interface SafetyCheckIn {
  /** Status switched to Orange. */
  requestedAt: number;
  /** The discreet prompt becomes visible at this point. */
  dueAt: number;
  answeredAt?: number;
}

/** One concrete Orange/Red escalation. Every escalation needs a fresh,
 * explicit companion acknowledgement; a start-time reachability confirmation
 * must never be reused as proof that somebody saw the current alert. */
export interface SafetyAlert {
  at: number;
  status: SafetyAlertStatus;
}

export interface SafetyCompanionConfirmation {
  /** General, temporary "Ich bin erreichbar" confirmation. */
  confirmedAt: number;
  /** Explicitly withdrawn reachability. This never revokes location access;
   * it only makes the promise to actively accompany the walk inactive. */
  unavailableAt?: number;
  /** Exact alert generation this person explicitly acknowledged. */
  alertAt?: number;
  alertAcknowledgedAt?: number;
}

/** One live Heimweg session — exactly one per person (`heimwege/{uid}`). */
export interface SafetySession {
  uid: string;
  displayName: string;
  initials: string;
  status: SafetyStatus;
  startedAt: number;
  updatedAt: number;
  /** Active sharing deadline. Defaults to 2 h and moves only by explicit extension. */
  expiresAt: number;
  /** Last-point retention after automatic timeout (short in blue, 30 min in orange/red). */
  retainUntil: number;
  /** Client-derived: sharing ended without an explicit "Sicher angekommen". */
  timedOut?: boolean;
  location?: SafetyLocation;
  /** Explicit concrete audience. It changes only through owner action + server validation. */
  audienceUids: string[];
  checkIn?: SafetyCheckIn;
  /** Present only while the current status is Orange/Red. */
  alert?: SafetyAlert;
  /** Voluntary "Ich bin erreichbar" confirmations, keyed by companion uid. */
  companions: Record<string, SafetyCompanionConfirmation>;
}

/** What a companion should show for a friend's session, honestly derived. */
export type CompanionSignal = 'ok' | 'unwell' | 'help' | 'no_response' | 'data_gap' | 'timed_out';

export const CHECKIN_RESPONSE_WINDOW_MS = 2 * 60 * 1000;
export const DATA_GAP_MS = 4 * 60 * 1000;
/** A confirmation is deliberately temporary. Being reachable once must not
 * silently imply that somebody is still watching hours later. */
export const COMPANION_CONFIRMATION_MS = 30 * 60 * 1000;

function isNewerThanUnavailable(
  confirmation: SafetyCompanionConfirmation,
  at: number,
): boolean {
  return at > Number(confirmation.unavailableAt ?? 0);
}

/** A companion consciously withdrew their active availability. */
export function isCompanionUnavailable(
  confirmation: SafetyCompanionConfirmation | undefined,
): boolean {
  return Boolean(
    confirmation &&
      Number.isFinite(confirmation.unavailableAt) &&
      Number(confirmation.unavailableAt) > Number(confirmation.confirmedAt ?? 0),
  );
}

/** Milliseconds until a normal reachability confirmation stops counting. */
export function companionConfirmationRemainingMs(
  confirmation: SafetyCompanionConfirmation | undefined,
  now: number,
): number {
  if (!confirmation || !Number.isFinite(confirmation.confirmedAt)) return 0;
  if (!isNewerThanUnavailable(confirmation, confirmation.confirmedAt)) return 0;
  return Math.max(0, confirmation.confirmedAt + COMPANION_CONFIRMATION_MS - now);
}

/** Milliseconds until the acknowledgement of this exact alert stops counting. */
export function companionAlertConfirmationRemainingMs(
  confirmation: SafetyCompanionConfirmation | undefined,
  alert: SafetyAlert | undefined,
  now: number,
): number {
  if (
    !confirmation ||
    !alert ||
    confirmation.alertAt !== alert.at ||
    !Number.isFinite(confirmation.alertAcknowledgedAt)
  ) {
    return 0;
  }
  const acknowledgedAt = confirmation.alertAcknowledgedAt ?? 0;
  if (!isNewerThanUnavailable(confirmation, acknowledgedAt)) return 0;
  return Math.max(0, acknowledgedAt + COMPANION_CONFIRMATION_MS - now);
}

export function isCompanionConfirmationActive(
  confirmation: SafetyCompanionConfirmation | undefined,
  now: number,
): boolean {
  return Boolean(
    confirmation &&
    Number.isFinite(confirmation.confirmedAt) &&
    companionConfirmationRemainingMs(confirmation, now) > 0,
  );
}

export function isCompanionWatchingAlert(
  confirmation: SafetyCompanionConfirmation | undefined,
  alert: SafetyAlert | undefined,
  now: number,
): boolean {
  return Boolean(
    confirmation &&
    alert &&
    Number.isFinite(alert.at) &&
    companionAlertConfirmationRemainingMs(confirmation, alert, now) > 0,
  );
}

/** Derives the companion-facing signal per the safety contract: non-response
 * with a fresh location is the strongest signal; a stale location is honestly
 * a possible battery/reception issue — never dramatized into more. */
export function deriveCompanionSignal(session: SafetySession, now: number): CompanionSignal {
  if (session.timedOut || session.expiresAt <= now) {
    if (session.status === 'red') return 'help';
    if (session.status === 'orange') return 'no_response';
    return 'timed_out';
  }
  const locationFresh = now - session.updatedAt < DATA_GAP_MS;
  if (session.status === 'red') return 'help';
  if (session.status === 'orange') {
    const missed =
      session.checkIn &&
      !session.checkIn.answeredAt &&
      now - session.checkIn.dueAt > CHECKIN_RESPONSE_WINDOW_MS;
    if (missed) return locationFresh ? 'no_response' : 'data_gap';
    if (!locationFresh) return 'data_gap';
    return 'unwell';
  }
  if (!locationFresh) return 'data_gap';
  return 'ok';
}
