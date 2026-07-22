import type { MarkerAvatar } from '../types/map.types';

interface ParticipantDisplay {
  avatars: MarkerAvatar[];
  count: number;
}

/**
 * Produces the participant state rendered on a map pin. Mock membership is
 * optimistic, while Firestore membership arrives through the activity listener;
 * this keeps the pin truthful during that short gap without double-counting
 * once the document has updated.
 */
export function participantDisplay(
  knownAvatars: MarkerAvatar[] | undefined,
  participantCount: number | undefined,
  fallbackAvatar: MarkerAvatar | undefined,
  joined: boolean,
  currentUser: MarkerAvatar | undefined,
): ParticipantDisplay {
  const avatars = knownAvatars?.length ? knownAvatars : fallbackAvatar ? [fallbackAvatar] : [];
  const includesCurrentUser = Boolean(
    currentUser && avatars.some((avatar) => avatar.userId === currentUser.userId),
  );
  const addOptimisticMember = joined && currentUser && !includesCurrentUser;

  return {
    avatars: addOptimisticMember ? [...avatars, currentUser] : avatars,
    count: Math.max(participantCount ?? 0, avatars.length, 1) + (addOptimisticMember ? 1 : 0),
  };
}
