import {
  deriveCompanionSignal,
  type CompanionSignal,
  type SafetySession,
  type SafetyStatus,
} from './types';

/** One color/word source for every safety surface (console, panel, pill,
 * shield, markers) — two diverging vocabularies here would directly undermine
 * the overview page that teaches them. */
export const STATUS_COLOR: Record<SafetyStatus, string> = {
  blue: '#6E8BF7',
  orange: '#E0A23E',
  red: '#FF5A5A',
};

// Wording rule (docs/safety-mode.md): describe what the PERSON did and what
// friends can see — never what recipient devices will do.
export const STATUS_WORD: Record<SafetyStatus, string> = {
  blue: 'Unterwegs',
  orange: 'Du fühlst dich unsicher',
  red: 'Hilferuf gesendet',
};

export function agoLabel(at: number | undefined, now: number): string {
  if (!at) return 'noch kein Standort';
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 10) return 'gerade eben';
  if (seconds < 60) return `vor ${seconds} Sek.`;
  const minutes = Math.round(seconds / 60);
  return `vor ${minutes} Min.`;
}

/** Companion signal → the severity bucket it belongs to. */
export function signalStatus(signal: CompanionSignal): SafetyStatus {
  if (signal === 'help' || signal === 'no_response') return 'red';
  if (signal === 'unwell' || signal === 'data_gap' || signal === 'timed_out') return 'orange';
  return 'blue';
}

const SEVERITY: Record<SafetyStatus, number> = { blue: 0, orange: 1, red: 2 };

/** Severity-first ("Wichtigkeit zuerst"): the single status that shield/pill
 * surfaces show — the worst across all shared sessions plus (optionally) the
 * own session. One orange friend turns everything orange. */
export function worstStatus(
  sessions: SafetySession[],
  now: number,
  ownStatus?: SafetyStatus,
): SafetyStatus {
  let worst: SafetyStatus = ownStatus ?? 'blue';
  for (const session of sessions) {
    const status = signalStatus(deriveCompanionSignal(session, now));
    if (SEVERITY[status] > SEVERITY[worst]) worst = status;
  }
  return worst;
}
