import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/features/auth';

import { circleService } from './services/circleService';
import { loadCachedCircles, saveCachedCircles } from './services/circleCache';
import type { CircleActor, CircleDoc } from './services/circleService.types';

interface CirclesContextValue {
  /** The local Circle cache was read for this account. */
  hydrated: boolean;
  circles: CircleDoc[];
  /** Refreshes private groups only when a surface actually needs them. */
  refreshCircles: () => Promise<void>;
  createCircle: (name: string, emoji?: string) => Promise<string>;
  setCircleFriends: (circleId: string, friendUids: string[]) => Promise<void>;
  deleteCircle: (circleId: string) => Promise<void>;
}

const CirclesContext = createContext<CirclesContextValue | null>(null);

/** Own private Circle lists. They are a convenience for the audience picker. */
export function CirclesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const actor = useMemo<CircleActor>(() => ({ uid: user?.id ?? 'u_you' }), [user?.id]);
  const [circles, setCircles] = useState<CircleDoc[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const requestVersion = useRef(0);
  const activeAccountUidRef = useRef(actor.uid);
  activeAccountUidRef.current = actor.uid;

  const saveAndSetCircles = useCallback(
    (next: CircleDoc[]) => {
      setCircles(next);
      void saveCachedCircles(actor.uid, next);
    },
    [actor.uid],
  );

  const refreshCircles = useCallback(async () => {
    const accountUid = actor.uid;
    const version = ++requestVersion.current;
    try {
      const next = await circleService.listCircles(actor);
      if (activeAccountUidRef.current === accountUid && version === requestVersion.current) {
        saveAndSetCircles(next);
      }
    } catch (error) {
      // Keep the last locally known private lists during a transient offline
      // failure. A blank picker is worse than a clearly stale shortcut.
      console.warn('[groups] Aktualisieren fehlgeschlagen:', error);
    }
  }, [actor, saveAndSetCircles]);

  useEffect(() => {
    const version = ++requestVersion.current;
    setCircles([]);
    setHydrated(false);
    void loadCachedCircles(actor.uid)
      .then((cached) => {
        if (
          cached &&
          activeAccountUidRef.current === actor.uid &&
          version === requestVersion.current
        ) {
          setCircles(cached);
        }
      })
      .catch((error) => {
        console.warn('[groups] Lokaler Cache konnte nicht geladen werden:', error);
      })
      .finally(() => {
        if (activeAccountUidRef.current === actor.uid && version === requestVersion.current) {
          setHydrated(true);
        }
      });
  }, [actor.uid]);

  const createCircle = useCallback(
    async (name: string, emoji?: string) => {
      const id = await circleService.createCircle(actor, name, emoji);
      await refreshCircles();
      return id;
    },
    [actor, refreshCircles],
  );
  const setCircleFriends = useCallback(
    async (circleId: string, friendUids: string[]) => {
      await circleService.setCircleFriends(actor, circleId, friendUids);
      await refreshCircles();
    },
    [actor, refreshCircles],
  );
  const deleteCircle = useCallback(
    async (circleId: string) => {
      await circleService.deleteCircle(actor, circleId);
      await refreshCircles();
    },
    [actor, refreshCircles],
  );

  const value = useMemo<CirclesContextValue>(
    () => ({ hydrated, circles, refreshCircles, createCircle, setCircleFriends, deleteCircle }),
    [hydrated, circles, refreshCircles, createCircle, setCircleFriends, deleteCircle],
  );

  return <CirclesContext.Provider value={value}>{children}</CirclesContext.Provider>;
}

export function useCircles() {
  const context = useContext(CirclesContext);
  if (!context) throw new Error('useCircles must be used within CirclesProvider');
  return context;
}
