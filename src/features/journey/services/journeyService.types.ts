import type { JourneyActivityContext } from '../types';

export type Unsubscribe = () => void;

export interface JourneyActor {
  uid: string;
  displayName: string;
  initials: string;
}

export interface JourneyLocationDoc {
  uid: string;
  sessionId: string;
  lat: number;
  lng: number;
  status: 'onTheWay' | 'arrived';
  updatedAt: number;
  expiresAt: number;
}

export interface JourneyAuthorizedContext {
  id: string;
  title: string;
  targetCoordinate: { latitude: number; longitude: number };
  startsAt?: string;
  endsAt?: string;
}

export interface JourneyService {
  ensureJourneyMember(
    actor: JourneyActor,
    activityId: string,
    options?: { sessionId?: string },
  ): Promise<JourneyAuthorizedContext>;
  subscribeActivityJourney(
    actor: JourneyActor,
    activity: JourneyActivityContext,
    cb: (locations: JourneyLocationDoc[]) => void,
    onError?: (error: Error) => void,
  ): Unsubscribe;
  startJourney(
    actor: JourneyActor,
    activity: JourneyActivityContext,
    sessionId: string,
    location: Omit<JourneyLocationDoc, 'uid' | 'sessionId'>,
  ): Promise<void>;
  updateJourney(
    actor: JourneyActor,
    activityId: string,
    sessionId: string,
    location: Omit<JourneyLocationDoc, 'uid' | 'sessionId'>,
  ): Promise<void>;
  setJourneyLiveStatus(
    actor: JourneyActor,
    activityId: string,
    sessionId: string,
    underway: boolean,
  ): Promise<void>;
  stopJourney(actor: JourneyActor, activityId: string, sessionId: string): Promise<void>;
}
