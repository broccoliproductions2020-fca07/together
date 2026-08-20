import type { ActivityCreateInput } from '@/features/activities/services/activityService.types';
import type { TimePlanCreateInput, TimePlanInterval } from '@/features/time-planning/types';

export type SyncOperationStatus = 'queued' | 'failed';

interface SyncOperationBase {
  /** Stable client-generated id. It is also the idempotency key on the server. */
  id: string;
  /** Operations are strictly partitioned by signed-in Firebase account. */
  accountId: string;
  createdAt: number;
  attempts: number;
  status: SyncOperationStatus;
  lastAttemptAt?: number;
  lastErrorCode?: string;
}

export interface ActivityCreateSyncPayload {
  activityId: string;
  /** The exact callable payload; the server resolves its audience again. */
  activity: ActivityCreateInput;
}

export interface ChatMessageSyncPayload {
  roomId: string;
  text: string;
  /** This becomes the Firestore message id, making retries idempotent. */
  clientMessageId: string;
}

export interface TimePlanCreateSyncPayload {
  /** The client-generated plan id is also the server-side idempotency key. */
  planId: string;
  plan: TimePlanCreateInput;
}

export interface TimePlanResponseSyncPayload {
  planId: string;
  revision: number;
  /** One response per source window; newer local edits replace an older retry. */
  responsesByWindow: Record<string, TimePlanInterval[]>;
}

export type SyncOperation =
  | (SyncOperationBase & {
      kind: 'activity.create';
      payload: ActivityCreateSyncPayload;
    })
  | (SyncOperationBase & {
      kind: 'chat.message';
      payload: ChatMessageSyncPayload;
    })
  | (SyncOperationBase & {
      kind: 'timePlan.create';
      payload: TimePlanCreateSyncPayload;
    })
  | (SyncOperationBase & {
      kind: 'timePlan.response';
      payload: TimePlanResponseSyncPayload;
    });

export type SyncOperationKind = SyncOperation['kind'];
export type SyncRunResult = 'sent' | 'queued';
