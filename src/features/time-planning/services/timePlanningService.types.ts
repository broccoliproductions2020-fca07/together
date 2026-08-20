import type {
  TimePlan,
  TimePlanActor,
  TimePlanCreateInput,
  TimePlanInterval,
  TimePlanMember,
} from '../types';
import type { SyncRunResult } from '@/features/sync';

export type Unsubscribe = () => void;

export interface TimePlanCreation {
  id: string;
  /** A transient offline failure is persisted and resumed by the shared outbox. */
  ready: Promise<SyncRunResult>;
}

export interface TimePlanningService {
  createTimePlan(actor: TimePlanActor, input: TimePlanCreateInput): TimePlanCreation;
  /**
   * Joining IS answering — one call, both or neither.
   *
   * Two calls would leave a window in which a dropped connection produces a
   * member with no availability: a name the host waits on forever. The server
   * refuses to create that state, so the client must not be able to ask for it.
   */
  joinTimePlan(
    actor: TimePlanActor,
    planId: string,
    responsesByWindow: Record<string, TimePlanInterval[]>,
  ): Promise<void>;
  /** Host-only. Turns the round into a real Activity and returns its id. */
  lockTimePlan(
    actor: TimePlanActor,
    planId: string,
    windowId: string,
    slot: TimePlanInterval,
  ): Promise<string>;
  respondToTimePlan(
    actor: TimePlanActor,
    planId: string,
    revision: number,
    responsesByWindow: Record<string, TimePlanInterval[]>,
  ): Promise<SyncRunResult>;
  /**
   * The rounds this person is in — joined OR merely invited — so a
   * Terminfindung can show on the map before anyone has answered.
   *
   * ONE listener, bounded, and only ever `collecting`: a locked round is an
   * Activity from then on and the activity feed already carries it.
   */
  subscribeInvitedTimePlans(actor: TimePlanActor, cb: (plans: TimePlan[]) => void): Unsubscribe;
  subscribeTimePlan(
    actor: TimePlanActor,
    planId: string,
    cb: (plan: TimePlan | null) => void,
  ): Unsubscribe;
  subscribeMembers(
    actor: TimePlanActor,
    planId: string,
    cb: (members: TimePlanMember[]) => void,
  ): Unsubscribe;
}
