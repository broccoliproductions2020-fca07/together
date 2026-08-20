import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth';

import { timePlanningService } from './services/timePlanningService';
import type { TimePlan } from './types';

/**
 * The rounds this person is in — joined or merely invited.
 *
 * ONE bounded listener, and it runs only while `active`. That mirrors friend
 * presence, which is deliberately alive only while the map surface is visible:
 * a Terminfindung is map furniture, so it has no business listening while
 * someone is in the calendar or a Heimweg focus.
 *
 * Locked rounds are excluded server-side by the query — from the moment a slot
 * is fixed the round IS an Activity, and the activity feed already carries it.
 */
export function useInvitedTimePlans(active: boolean): TimePlan[] {
  const { user } = useAuth();
  const uid = user?.id;
  const [plans, setPlans] = useState<TimePlan[]>([]);

  useEffect(() => {
    if (!active || !uid) {
      setPlans([]);
      return;
    }
    let current = true;
    const stop = timePlanningService.subscribeInvitedTimePlans({ uid }, (next) => {
      if (current) setPlans(next);
    });
    return () => {
      current = false;
      stop();
    };
  }, [active, uid]);

  return plans;
}
