import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'together.activity.coParticipants.v1';
const HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const SEEN_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_SUGGESTIONS = 6;

interface PersonHistory {
  count: number;
  lastAt: number;
}

interface InviteHistory {
  people: Record<string, PersonHistory>;
  /** One key per activity/person pair prevents repeat provider renders from
   * inflating the local suggestion score. */
  seenPairs: Record<string, number>;
}

const EMPTY_HISTORY: InviteHistory = { people: {}, seenPairs: {} };

function isHistory(value: unknown): value is InviteHistory {
  return Boolean(value && typeof value === 'object' && 'people' in value && 'seenPairs' in value);
}

async function readHistory(): Promise<InviteHistory> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) return EMPTY_HISTORY;
    const parsed: unknown = JSON.parse(stored);
    if (!isHistory(parsed)) return EMPTY_HISTORY;
    return {
      people: parsed.people ?? {},
      seenPairs: parsed.seenPairs ?? {},
    };
  } catch {
    return EMPTY_HISTORY;
  }
}

function prune(history: InviteHistory, now: number): InviteHistory {
  const people = Object.fromEntries(
    Object.entries(history.people).filter(([, item]) => now - item.lastAt <= HISTORY_WINDOW_MS),
  );
  const seenPairs = Object.fromEntries(
    Object.entries(history.seenPairs).filter(([, seenAt]) => now - seenAt <= SEEN_WINDOW_MS),
  );
  return { people, seenPairs };
}

/** Records only real co-participation, never activity names, places or chats. */
export async function recordCoParticipants(
  activityId: string,
  actorUid: string,
  participantUids: string[],
): Promise<void> {
  const now = Date.now();
  const history = prune(await readHistory(), now);
  let changed = false;

  [...new Set(participantUids)]
    .filter((uid) => uid !== actorUid)
    .forEach((uid) => {
      const pairKey = `${activityId}:${uid}`;
      if (history.seenPairs[pairKey]) return;
      const previous = history.people[uid];
      history.people[uid] = {
        count: (previous?.count ?? 0) + 1,
        lastAt: now,
      };
      history.seenPairs[pairKey] = now;
      changed = true;
    });

  if (changed) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history)).catch(() => {});
  }
}

/** Local-only suggestions, limited to current friends and weighted by recency. */
export function useFrequentPeople(friendUids: string[]): string[] {
  const friendKey = useMemo(() => [...friendUids].sort().join('|'), [friendUids]);
  const [history, setHistory] = useState<InviteHistory>(EMPTY_HISTORY);

  useEffect(() => {
    let active = true;
    void readHistory().then((next) => {
      if (active) setHistory(prune(next, Date.now()));
    });
    return () => {
      active = false;
    };
  }, [friendKey]);

  return useMemo(() => {
    const now = Date.now();
    const allowed = new Set(friendUids);
    return Object.entries(history.people)
      .filter(([uid, item]) => allowed.has(uid) && now - item.lastAt <= HISTORY_WINDOW_MS)
      .sort(([, first], [, second]) => {
        const firstAge = (now - first.lastAt) / (24 * 60 * 60 * 1000);
        const secondAge = (now - second.lastAt) / (24 * 60 * 60 * 1000);
        const firstScore = first.count * 3 + Math.max(0, 2 - firstAge / 45);
        const secondScore = second.count * 3 + Math.max(0, 2 - secondAge / 45);
        return secondScore - firstScore;
      })
      .slice(0, MAX_SUGGESTIONS)
      .map(([uid]) => uid);
  }, [friendUids, history]);
}
