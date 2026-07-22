import { mockCircles } from '@/data/mock';

import type { CircleDoc, CircleService } from './circleService.types';

const circlesByActor = new Map<string, Map<string, CircleDoc>>();

function initialCircles(actorUid: string) {
  const circles = new Map<string, CircleDoc>();
  mockCircles.forEach((seed, index) => {
    circles.set(seed.id, {
      id: seed.id,
      name: seed.name,
      emoji: seed.emoji,
      // Legacy mock data had the owner in memberIds. A private Circle keeps
      // only friend ids from now on.
      friendUids: seed.memberIds.filter((uid) => uid !== 'u_you'),
      createdAt: Date.now() - (index + 1) * 60_000,
      updatedAt: Date.now() - (index + 1) * 60_000,
    });
  });
  circlesByActor.set(actorUid, circles);
  return circles;
}

function circlesFor(actorUid: string) {
  return circlesByActor.get(actorUid) ?? initialCircles(actorUid);
}

export const mockCircleService: CircleService = {
  async listCircles(actor) {
    return [...circlesFor(actor.uid).values()].sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async createCircle(actor, name, emoji) {
    const id = `circle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    circlesFor(actor.uid).set(id, {
      id,
      name: name.trim(),
      ...(emoji?.trim() ? { emoji: emoji.trim() } : {}),
      friendUids: [],
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },

  async setCircleFriends(actor, circleId, friendUids) {
    const current = circlesFor(actor.uid).get(circleId);
    if (!current) return;
    circlesFor(actor.uid).set(circleId, {
      ...current,
      friendUids: [...new Set(friendUids)].slice(0, 50),
      updatedAt: Date.now(),
    });
  },

  async deleteCircle(actor, circleId) {
    circlesFor(actor.uid).delete(circleId);
  },
};
