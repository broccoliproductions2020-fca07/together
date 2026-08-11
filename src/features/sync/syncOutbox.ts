import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SyncOperation, SyncOperationKind, SyncRunResult } from './syncOutbox.types';

const OUTBOX_KEY_PREFIX = 'together.sync.outbox.v1';
const MAX_OPERATIONS_PER_ACCOUNT = 100;

type SyncOperationHandler = (operation: SyncOperation) => Promise<void>;

const handlers = new Map<SyncOperationKind, SyncOperationHandler>();
const listeners = new Map<string, Set<(operations: SyncOperation[]) => void>>();
const accountLocks = new Map<string, Promise<void>>();

function outboxKey(accountId: string) {
  return `${OUTBOX_KEY_PREFIX}.${encodeURIComponent(accountId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSyncOperation(value: unknown): value is SyncOperation {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== 'string' ||
    typeof value.accountId !== 'string' ||
    typeof value.createdAt !== 'number' ||
    typeof value.attempts !== 'number' ||
    (value.status !== 'queued' && value.status !== 'failed') ||
    !isRecord(value.payload)
  ) {
    return false;
  }
  if (value.kind === 'activity.create') {
    return typeof value.payload.activityId === 'string' && isRecord(value.payload.activity);
  }
  return (
    value.kind === 'chat.message' &&
    typeof value.payload.roomId === 'string' &&
    typeof value.payload.text === 'string' &&
    typeof value.payload.clientMessageId === 'string'
  );
}

async function readOutbox(accountId: string): Promise<SyncOperation[]> {
  const raw = await AsyncStorage.getItem(outboxKey(accountId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSyncOperation).filter((operation) => operation.accountId === accountId);
  } catch {
    // A damaged local cache must never block the next online action.
    return [];
  }
}

function emit(accountId: string, operations: SyncOperation[]) {
  listeners.get(accountId)?.forEach((listener) => listener(operations));
}

async function saveOutbox(accountId: string, operations: SyncOperation[]) {
  if (operations.length === 0) {
    await AsyncStorage.removeItem(outboxKey(accountId));
  } else {
    await AsyncStorage.setItem(outboxKey(accountId), JSON.stringify(operations));
  }
  emit(accountId, operations);
}

async function withAccountLock<T>(accountId: string, action: () => Promise<T>): Promise<T> {
  const previous = accountLocks.get(accountId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  accountLocks.set(accountId, queued);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (accountLocks.get(accountId) === queued) accountLocks.delete(accountId);
  }
}

function errorCode(error: unknown) {
  if (!isRecord(error) || typeof error.code !== 'string') return undefined;
  return error.code.replace(/^functions\//, '');
}

/** Only failures where the server may still accept the exact same request later. */
export function isRetryableSyncError(error: unknown) {
  const code = errorCode(error);
  return (
    code === undefined ||
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'internal' ||
    code === 'aborted'
  );
}

export function registerSyncOperationHandler(
  kind: SyncOperationKind,
  handler: SyncOperationHandler,
) {
  handlers.set(kind, handler);
}

export async function loadSyncOperations(accountId: string) {
  return readOutbox(accountId);
}

export function subscribeSyncOperations(
  accountId: string,
  listener: (operations: SyncOperation[]) => void,
) {
  const accountListeners = listeners.get(accountId) ?? new Set();
  accountListeners.add(listener);
  listeners.set(accountId, accountListeners);
  return () => {
    accountListeners.delete(listener);
    if (accountListeners.size === 0) listeners.delete(accountId);
  };
}

export async function enqueueSyncOperation(operation: SyncOperation) {
  await withAccountLock(operation.accountId, async () => {
    const operations = await readOutbox(operation.accountId);
    const existingIndex = operations.findIndex((candidate) => candidate.id === operation.id);
    const next = {
      ...operation,
      status: 'queued' as const,
      lastErrorCode: undefined,
    };
    if (existingIndex >= 0) {
      operations[existingIndex] = next;
    } else {
      if (operations.length >= MAX_OPERATIONS_PER_ACCOUNT) {
        throw new Error('Zu viele ausstehende Offline-Aktionen. Bitte verbinde dich erneut.');
      }
      operations.push(next);
    }
    await saveOutbox(operation.accountId, operations);
  });
}

/**
 * Runs the operation immediately. A transient failure is persisted and counts
 * as accepted locally, while permanent server rejections still reach the UI.
 */
export async function runOrEnqueueSyncOperation(
  operation: SyncOperation,
  perform: () => Promise<void>,
): Promise<SyncRunResult> {
  try {
    await perform();
    return 'sent';
  } catch (error) {
    if (!isRetryableSyncError(error)) throw error;
    await enqueueSyncOperation(operation);
    return 'queued';
  }
}

/** Flushes in creation order and stops at the first temporary connection error. */
export async function flushSyncOperations(accountId: string) {
  await withAccountLock(accountId, async () => {
    let operations = await readOutbox(accountId);
    for (const operation of operations) {
      if (operation.status !== 'queued') continue;
      const handler = handlers.get(operation.kind);
      if (!handler) continue;
      try {
        await handler(operation);
        operations = operations.filter((candidate) => candidate.id !== operation.id);
        await saveOutbox(accountId, operations);
      } catch (error) {
        const lastErrorCode = errorCode(error);
        const index = operations.findIndex((candidate) => candidate.id === operation.id);
        if (index < 0) continue;
        operations[index] = {
          ...operation,
          attempts: operation.attempts + 1,
          lastAttemptAt: Date.now(),
          ...(lastErrorCode ? { lastErrorCode } : {}),
          status: isRetryableSyncError(error) ? 'queued' : 'failed',
        };
        await saveOutbox(accountId, operations);
        // A retryable error normally means the connection is still unavailable.
        if (isRetryableSyncError(error)) return;
      }
    }
  });
}
