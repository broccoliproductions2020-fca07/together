import type { ReactNode } from 'react';

import { ActivityEntityProvider } from '@/features/activities';
import { ChatProvider } from '@/features/chat';
import { CirclesProvider } from '@/features/circles';
import { FriendsProvider } from '@/features/friends';
import { JourneyProvider } from '@/features/journey';
import { ModerationProvider } from '@/features/moderation';
import { NotificationsProvider } from '@/features/notifications';
import { OpenStatusProvider } from '@/features/presence';
import { SafetyProvider } from '@/features/safety';
import { SyncProvider } from '@/features/sync';

/** Map-critical data starts before the first authenticated route is revealed. */
export function MapBootProviders({ children }: { children: ReactNode }) {
  return (
    <SyncProvider>
      <FriendsProvider>
        <CirclesProvider>
          <ActivityEntityProvider>{children}</ActivityEntityProvider>
        </CirclesProvider>
      </FriendsProvider>
    </SyncProvider>
  );
}

/** Providers required by the interactive map and authenticated surfaces. */
export function DeferredAuthenticatedProviders({ children }: { children: ReactNode }) {
  return (
    <ChatProvider>
      <JourneyProvider>
        <SafetyProvider>
          <OpenStatusProvider>
            <NotificationsProvider>
              <ModerationProvider>{children}</ModerationProvider>
            </NotificationsProvider>
          </OpenStatusProvider>
        </SafetyProvider>
      </JourneyProvider>
    </ChatProvider>
  );
}

/** Providers that only exist while an authenticated user session is active. */
export function AuthenticatedProviders({ children }: { children: ReactNode }) {
  return (
    <MapBootProviders>
      <DeferredAuthenticatedProviders>{children}</DeferredAuthenticatedProviders>
    </MapBootProviders>
  );
}
