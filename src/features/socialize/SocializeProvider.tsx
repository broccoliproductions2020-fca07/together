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
import { AppState } from 'react-native';

import { SOCIALIZE_SEED } from './data/socializeSeed';
import { useAuth } from '@/features/auth';
import { BACKEND } from '@/shared/services/firebase';
import { socializeService } from './services/socializeService';
import type { SocializeActor } from './services/socializeService.types';
import type {
  DiscoverCard,
  DiscoverState,
  MatchMessage,
  SocialSession,
  SocialVibe,
} from './types/socialize.types';

/** Socialize's own accent — deliberately distinct from open/soon/now so users
 * always know they're in the strangers world, not the friends world. */
export const SOCIALIZE_COLOR = '#B07CFF';

export const SOCIAL_VIBES: SocialVibe[] = [
  { label: 'Kaffee', emoji: '☕' },
  { label: 'Spazieren', emoji: '🚶' },
  { label: 'Bar', emoji: '🍻' },
  { label: 'Sport', emoji: '🏃' },
  { label: 'Lernen', emoji: '📚' },
  { label: 'Egal', emoji: '🤷' },
];

export const SOCIAL_RADII_KM = [1, 3, 5];

// 1-tap defaults ("Jetzt sichtbar werden" — refine afterwards, never a wizard).
const DEFAULT_RADIUS_KM = 5;
const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const AUTO_MATCH_DELAY_MS = 2400;
const DISCOVERY_REFRESH_MS = 2 * 60 * 1000;

interface SocializeContextValue {
  session: SocialSession | null;
  cards: DiscoverCard[];
  discovering: boolean;
  cardStates: Record<string, DiscoverState>;
  messages: Record<string, MatchMessage[]>;
  vibes: SocialVibe[];
  goVisible: () => void;
  stopVisible: () => void;
  setRadius: (km: number) => void;
  setExpiresAt: (ts: number) => void;
  setNote: (note: string) => void;
  toggleVibe: (label: string) => void;
  setScreenActive: (active: boolean) => void;
  showInterest: (cardId: string) => void;
  loadMessages: (cardId: string) => Promise<void>;
  sendMessage: (cardId: string, text: string) => void;
}

const SocializeContext = createContext<SocializeContextValue | null>(null);

/**
 * Client-side mock backend for the Socialize mode (see AGENTS.md). Interest on
 * `autoMatch` seed cards reciprocates after a short delay to demo the mutual
 * consent flow. Matches and chats deliberately SURVIVE stopping visibility —
 * an interest/match must not evaporate just because someone's session ended
 * (cold-start decision). Firebase mode runs through the Socialize callable
 * functions; mock mode keeps the deterministic offline seed.
 */
export function SocializeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const actor = useMemo<SocializeActor>(
    () => ({
      uid: user?.id ?? 'u_you',
      displayName: user?.displayName ?? 'Du',
      initials: (user?.displayName ?? 'Du').slice(0, 2).toUpperCase(),
    }),
    [user?.displayName, user?.id],
  );
  const useFirebase = BACKEND === 'firebase';
  const [session, setSession] = useState<SocialSession | null>(null);
  const [cards, setCards] = useState<DiscoverCard[]>(() => (useFirebase ? [] : SOCIALIZE_SEED));
  const [discovering, setDiscovering] = useState(false);
  const [cardStates, setCardStates] = useState<Record<string, DiscoverState>>({});
  const [messages, setMessages] = useState<Record<string, MatchMessage[]>>({});
  const [screenActive, setScreenActive] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const matchTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const discoverInFlight = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!session || !useFirebase || !screenActive || !appActive) {
      if (!useFirebase) setCards(SOCIALIZE_SEED);
      return;
    }
    let cancelled = false;
    const load = async () => {
      if (discoverInFlight.current) return;
      discoverInFlight.current = true;
      setDiscovering(true);
      try {
        const next = await socializeService.discover(actor);
        if (!cancelled) setCards(next);
      } catch (error) {
        console.warn('[socialize] discover failed', error);
      } finally {
        discoverInFlight.current = false;
        if (!cancelled) setDiscovering(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), DISCOVERY_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [actor, appActive, screenActive, session, useFirebase]);

  // Auto-expire visibility when the session's end time passes.
  useEffect(() => {
    if (!session) return;
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      setSession(null);
      return;
    }
    const timer = setTimeout(() => setSession(null), remaining);
    return () => clearTimeout(timer);
  }, [session]);

  // Clear pending demo match timers on unmount.
  useEffect(() => {
    const timers = matchTimers.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  const goVisible = useCallback(() => {
    const nextSession: SocialSession = {
      radiusKm: DEFAULT_RADIUS_KM,
      expiresAt: Date.now() + DEFAULT_DURATION_MS,
      note: '',
      vibes: [],
    };
    setSession(nextSession);
    if (useFirebase) {
      void socializeService.startSession(actor, nextSession).catch((error) => {
        console.warn('[socialize] session start failed', error);
        setSession(null);
      });
    }
  }, [actor, useFirebase]);

  const stopVisible = useCallback(() => {
    setSession(null);
    if (useFirebase) {
      void socializeService
        .stopSession(actor)
        .catch((error) => console.warn('[socialize] session stop failed', error));
    }
  }, [actor, useFirebase]);

  const syncSession = useCallback(
    (next: SocialSession) => {
      if (useFirebase) {
        void socializeService
          .updateSession(actor, next)
          .catch((error) => console.warn('[socialize] session update failed', error));
      }
    },
    [actor, useFirebase],
  );

  const setRadius = useCallback(
    (radiusKm: number) => {
      setSession((current) => {
        if (!current) return current;
        const next = { ...current, radiusKm };
        syncSession(next);
        return next;
      });
    },
    [syncSession],
  );

  const setExpiresAt = useCallback(
    (expiresAt: number) => {
      setSession((current) => {
        if (!current) return current;
        const next = { ...current, expiresAt };
        syncSession(next);
        return next;
      });
    },
    [syncSession],
  );

  const setNote = useCallback(
    (note: string) => {
      setSession((current) => {
        if (!current) return current;
        const next = { ...current, note };
        syncSession(next);
        return next;
      });
    },
    [syncSession],
  );

  const toggleVibe = useCallback(
    (label: string) => {
      setSession((current) => {
        if (!current) return current;
        const active = current.vibes.includes(label);
        const next = {
          ...current,
          vibes: active ? current.vibes.filter((v) => v !== label) : [...current.vibes, label],
        };
        syncSession(next);
        return next;
      });
    },
    [syncSession],
  );

  const showInterest = useCallback(
    (cardId: string) => {
      if (useFirebase) {
        void socializeService
          .showInterest(actor, cardId)
          .then((state) => setCardStates((current) => ({ ...current, [cardId]: state })))
          .catch((error) => console.warn('[socialize] interest failed', error));
        return;
      }
      setCardStates((current) => {
        if (current[cardId] && current[cardId] !== 'idle') return current;
        return { ...current, [cardId]: 'interested' };
      });

      const card = SOCIALIZE_SEED.find((item) => item.id === cardId);
      if (!card?.autoMatch || matchTimers.current.has(cardId)) return;

      const timer = setTimeout(() => {
        matchTimers.current.delete(cardId);
        setCardStates((current) =>
          current[cardId] === 'interested' ? { ...current, [cardId]: 'matched' } : current,
        );
        if (card.greeting) {
          setMessages((current) => ({
            ...current,
            [cardId]: current[cardId]?.length
              ? current[cardId]
              : [{ id: `${cardId}-greeting`, fromMe: false, text: card.greeting!, at: Date.now() }],
          }));
        }
      }, AUTO_MATCH_DELAY_MS);
      matchTimers.current.set(cardId, timer);
    },
    [actor, useFirebase],
  );

  const loadMessages = useCallback(
    async (cardId: string) => {
      if (!useFirebase) return;
      try {
        const next = await socializeService.getMessages(actor, cardId);
        setMessages((current) => ({ ...current, [cardId]: next }));
      } catch (error) {
        console.warn('[socialize] messages failed', error);
      }
    },
    [actor, useFirebase],
  );

  const sendMessage = useCallback(
    (cardId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (useFirebase) {
        void socializeService
          .sendMessage(actor, cardId, trimmed)
          .then((message) =>
            setMessages((current) => ({
              ...current,
              [cardId]: [...(current[cardId] ?? []), message],
            })),
          )
          .catch((error) => console.warn('[socialize] message send failed', error));
        return;
      }
      setMessages((current) => ({
        ...current,
        [cardId]: [
          ...(current[cardId] ?? []),
          { id: `${cardId}-${Date.now()}`, fromMe: true, text: trimmed, at: Date.now() },
        ],
      }));
    },
    [actor, useFirebase],
  );

  const value = useMemo<SocializeContextValue>(
    () => ({
      session,
      cards,
      discovering,
      cardStates,
      messages,
      vibes: SOCIAL_VIBES,
      goVisible,
      stopVisible,
      setRadius,
      setExpiresAt,
      setNote,
      toggleVibe,
      setScreenActive,
      showInterest,
      loadMessages,
      sendMessage,
    }),
    [
      session,
      cardStates,
      messages,
      cards,
      discovering,
      goVisible,
      stopVisible,
      setRadius,
      setExpiresAt,
      setNote,
      toggleVibe,
      setScreenActive,
      showInterest,
      loadMessages,
      sendMessage,
    ],
  );

  return <SocializeContext.Provider value={value}>{children}</SocializeContext.Provider>;
}

export function useSocialize() {
  const context = useContext(SocializeContext);
  if (!context) {
    throw new Error('useSocialize must be used within SocializeProvider');
  }
  return context;
}
