import NetInfo from '@react-native-community/netinfo';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth';

import { flushSyncOperations, loadSyncOperations, subscribeSyncOperations } from './syncOutbox';
import type { SyncOperation } from './syncOutbox.types';

interface SyncOutboxContextValue {
  /** The persisted local outbox was read for this account. */
  hydrated: boolean;
  operations: SyncOperation[];
  pendingCount: number;
  failedCount: number;
}

const SyncOutboxContext = createContext<SyncOutboxContextValue | null>(null);

function isOnline(state: { isConnected: boolean | null; isInternetReachable: boolean | null }) {
  return state.isConnected === true && state.isInternetReachable !== false;
}

/**
 * Observes connectivity once for the authenticated session. It wakes the
 * persisted queue on reconnect and foreground, without a retry polling loop.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const accountId = user?.id;
  const [operations, setOperations] = useState<SyncOperation[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const flush = useCallback(() => {
    if (!accountId) return;
    void flushSyncOperations(accountId).catch((error) => {
      console.warn('[sync] Outbox konnte nicht abgearbeitet werden:', error);
    });
  }, [accountId]);

  useEffect(() => {
    if (!accountId) {
      setOperations([]);
      setHydrated(true);
      return;
    }
    let active = true;
    setHydrated(false);
    void loadSyncOperations(accountId)
      .then((stored) => {
        if (active) setOperations(stored);
      })
      .catch((error) => {
        console.warn('[sync] Outbox konnte nicht geladen werden:', error);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    const unsubscribe = subscribeSyncOperations(accountId, (next) => {
      if (active) setOperations(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (isOnline(state)) flush();
    });
    void NetInfo.fetch().then((state) => {
      if (isOnline(state)) flush();
    });
    return unsubscribe;
  }, [accountId, flush]);

  useEffect(() => {
    if (!accountId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void NetInfo.fetch().then((network) => {
        if (isOnline(network)) flush();
      });
    });
    return () => subscription.remove();
  }, [accountId, flush]);

  const value = useMemo<SyncOutboxContextValue>(
    () => ({
      hydrated,
      operations,
      pendingCount: operations.filter((operation) => operation.status === 'queued').length,
      failedCount: operations.filter((operation) => operation.status === 'failed').length,
    }),
    [hydrated, operations],
  );

  return <SyncOutboxContext.Provider value={value}>{children}</SyncOutboxContext.Provider>;
}

export function useSyncOutbox() {
  const context = useContext(SyncOutboxContext);
  if (!context) throw new Error('useSyncOutbox must be used within SyncProvider');
  return context;
}
