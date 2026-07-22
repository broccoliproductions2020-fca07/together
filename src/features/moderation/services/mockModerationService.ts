import type { ModerationService, ReportReason } from './moderationService.types';

const blocked = new Set<string>();
const subscribers = new Set<(uids: string[]) => void>();

function emit() {
  subscribers.forEach((subscriber) => subscriber([...blocked]));
}

export const mockModerationService: ModerationService = {
  subscribeBlockedUsers(_actor, cb) {
    subscribers.add(cb);
    cb([...blocked]);
    return () => subscribers.delete(cb);
  },
  async blockUser(_actor, targetUid) {
    blocked.add(targetUid);
    emit();
  },
  async unblockUser(_actor, targetUid) {
    blocked.delete(targetUid);
    emit();
  },
  async reportUser(_actor, _targetUid, _reason: ReportReason) {
    // Mock mode deliberately has no remote moderation endpoint.
  },

  async resolveProfiles(_actor, uids) {
    // Mock mode has no profile store — derive a stable placeholder per uid.
    return uids.map((uid) => ({
      uid,
      displayName: `Nutzer:in ${uid.slice(-4).toUpperCase()}`,
      initials: uid.slice(-2).toUpperCase(),
    }));
  },
};
