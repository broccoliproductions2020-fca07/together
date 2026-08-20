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
  joinTimePlan(actor: TimePlanActor, planId: string): Promise<void>;
  respondToTimePlan(
    actor: TimePlanActor,
    planId: string,
    revision: number,
    responsesByWindow: Record<string, TimePlanInterval[]>,
  ): Promise<SyncRunResult>;
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
