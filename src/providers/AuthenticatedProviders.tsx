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

/** Providers that only exist while an authenticated user session is active. */
export function AuthenticatedProviders({ children }: { children: ReactNode }) {
  return (
    <FriendsProvider>
      <CirclesProvider>
        <ChatProvider>
          <ActivityEntityProvider>
            <JourneyProvider>
              <SafetyProvider>
                <OpenStatusProvider>
                  <NotificationsProvider>
                    <ModerationProvider>{children}</ModerationProvider>
                  </NotificationsProvider>
                </OpenStatusProvider>
              </SafetyProvider>
            </JourneyProvider>
          </ActivityEntityProvider>
        </ChatProvider>
      </CirclesProvider>
    </FriendsProvider>
  );
}
