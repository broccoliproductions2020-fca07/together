import type { ActivityMode } from './activity';

/** Minimal, denormalized participant data safe to render in social surfaces. */
export interface ParticipantPreview {
  userId: string;
  displayName: string;
  initials: string;
  avatarUrl?: string;
  mode?: ActivityMode;
}
