export interface SocialVibe {
  label: string;
  emoji?: string;
}

/** The user's own visibility session. null anywhere = not visible. */
export interface SocialSession {
  /** Discovery radius in km (both sides must be in range → mutual visibility). */
  radiusKm: number;
  /** Epoch ms — visibility ends automatically at this time. */
  expiresAt: number;
  /** Free text "Worauf hast du Lust?" — the main decision basis for strangers. */
  note: string;
  /** Selected vibe labels. */
  vibes: string[];
}

export type DiscoverState = 'idle' | 'interested' | 'matched';

export interface DiscoverCard {
  id: string;
  kind: 'person' | 'group';
  /** Real name — revealed only AFTER a match (privat bis Match). */
  displayName: string;
  initials: string;
  /** Group size (kind === 'group' only). */
  memberCount?: number;
  /** Coarse distance only — never an exact position. */
  distanceLabel: string;
  note: string;
  vibes: SocialVibe[];
  /** Demo seed: reciprocates interest after a short delay. */
  autoMatch?: boolean;
  /** First message the match sends once the chat opens (demo seed). */
  greeting?: string;
}

export interface MatchMessage {
  id: string;
  fromMe: boolean;
  text: string;
  at: number;
}
