import type { JourneyActivityContext } from '../types';

export type Unsubscribe = () => void;

export interface JourneyActor {
  uid: string;
  displayName: string;
  initials: string;
}

export interface JourneyLocationDoc {
  uid: string;
  lat: number;
  lng: number;
  status: 'onTheWay' | 'arrived';
  updatedAt: number;
  expiresAt: number;
}

export interface JourneyService {
  ensureJourneyMember(actor: JourneyActor, activityId: string): Promise<void>;
  subscribeActivityJourney(
    actor: JourneyActor,
    activity: JourneyActivityContext,
    cb: (locations: JourneyLocationDoc[]) => void,
  ): Unsubscribe;
  startJourney(
    actor: JourneyActor,
    activity: JourneyActivityContext,
    location: Omit<JourneyLocationDoc, 'uid'>,
  ): Promise<void>;
  updateJourney(
    actor: JourneyActor,
    activityId: string,
    location: Omit<JourneyLocationDoc, 'uid'>,
  ): Promise<void>;
  setJourneyLiveStatus(actor: JourneyActor, activityId: string, underway: boolean): Promise<void>;
  stopJourney(actor: JourneyActor, activityId: string): Promise<void>;
}
