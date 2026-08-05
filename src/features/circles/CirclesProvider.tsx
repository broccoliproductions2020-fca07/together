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
  const requestVersion = useRef(0);

  const saveAndSetCircles = useCallback(
    (next: CircleDoc[]) => {
      setCircles(next);
      void saveCachedCircles(actor.uid, next);
    },
    [actor.uid],
  );

  const refreshCircles = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const next = await circleService.listCircles(actor);
      if (version === requestVersion.current) saveAndSetCircles(next);
    } catch (error) {
      // Keep the last locally known private lists during a transient offline
      // failure. A blank picker is worse than a clearly stale shortcut.
      console.warn('[groups] Aktualisieren fehlgeschlagen:', error);
    }
  }, [actor, saveAndSetCircles]);

  useEffect(() => {
    const version = ++requestVersion.current;
    setCircles([]);
    void loadCachedCircles(actor.uid).then((cached) => {
      if (cached && version === requestVersion.current) setCircles(cached);
    });
  }, [actor]);

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
    () => ({ circles, refreshCircles, createCircle, setCircleFriends, deleteCircle }),
    [circles, refreshCircles, createCircle, setCircleFriends, deleteCircle],
  );

  return <CirclesContext.Provider value={value}>{children}</CirclesContext.Provider>;
}

export function useCircles() {
  const context = useContext(CirclesContext);
  if (!context) throw new Error('useCircles must be used within CirclesProvider');
  return context;
}
