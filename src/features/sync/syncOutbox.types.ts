import type { ActivityCreateInput } from '@/features/activities/services/activityService.types';

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

export type SyncOperation =
  | (SyncOperationBase & {
      kind: 'activity.create';
      payload: ActivityCreateSyncPayload;
    })
  | (SyncOperationBase & {
      kind: 'chat.message';
      payload: ChatMessageSyncPayload;
    });

export type SyncOperationKind = SyncOperation['kind'];
export type SyncRunResult = 'sent' | 'queued';
