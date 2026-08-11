import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/features/auth';

import { moderationService } from './services/moderationService';
import type { BlockedProfile, ReportReason } from './services/moderationService.types';

interface ModerationContextValue {
  blockedUids: string[];
  isBlocked: (uid: string) => boolean;
  blockUser: (uid: string) => Promise<void>;
  unblockUser: (uid: string) => Promise<void>;
  reportUser: (uid: string, reason: ReportReason) => Promise<void>;
  /** Display profiles for the current block list — one-off fetch, no listener. */
  resolveBlockedProfiles: () => Promise<BlockedProfile[]>;
}

const ModerationContext = createContext<ModerationContextValue | null>(null);

export function ModerationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const actor = useMemo(() => ({ uid: user?.id ?? 'u_you' }), [user?.id]);
  const [blockedUids, setBlockedUids] = useState<string[]>([]);
  const activeAccountUidRef = useRef(actor.uid);
  activeAccountUidRef.current = actor.uid;

  useEffect(() => {
    const accountUid = actor.uid;
    setBlockedUids([]);
    return moderationService.subscribeBlockedUsers(actor, (uids) => {
      if (activeAccountUidRef.current !== accountUid) return;
      setBlockedUids(uids);
    });
  }, [actor]);

  const value = useMemo<ModerationContextValue>(
    () => ({
      blockedUids,
      isBlocked: (uid) => blockedUids.includes(uid),
      blockUser: async (uid) => {
        const accountUid = actor.uid;
        await moderationService.blockUser(actor, uid);
        if (activeAccountUidRef.current !== accountUid) return;
        setBlockedUids((current) => (current.includes(uid) ? current : [...current, uid]));
      },
      unblockUser: async (uid) => {
        const accountUid = actor.uid;
        await moderationService.unblockUser(actor, uid);
        if (activeAccountUidRef.current !== accountUid) return;
        setBlockedUids((current) => current.filter((item) => item !== uid));
      },
      reportUser: (uid, reason) => moderationService.reportUser(actor, uid, reason),
      resolveBlockedProfiles: () => moderationService.resolveProfiles(actor, blockedUids),
    }),
    [actor, blockedUids],
  );

  return <ModerationContext.Provider value={value}>{children}</ModerationContext.Provider>;
}

export function useModeration() {
  const context = useContext(ModerationContext);
  if (!context) throw new Error('useModeration must be used within ModerationProvider');
  return context;
}
