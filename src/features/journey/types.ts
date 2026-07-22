import type { MapCoordinate, MarkerAvatar, MockMapPosition } from '@/features/map/types/map.types';

/**
 * `armed` is deliberately private: the user opted in, but no location has
 * left the device yet. Only `underway` and `arrived` are ever written to RTDB.
 */
export type JourneyStatus = 'armed' | 'underway' | 'arrived' | 'stopped';

export interface JourneyActivityContext {
  id: string;
  title: string;
  participants: MarkerAvatar[];
  /** Exact destination for the live journey stream. */
  targetCoordinate?: MapCoordinate;
  targetPosition?: MockMapPosition;
  startsAt?: string;
  endsAt?: string;
}

export interface JourneyParticipant extends MarkerAvatar {
  status: Exclude<JourneyStatus, 'stopped'>;
  distanceKm: number;
  updatedAt: string;
  /** Exact live position. It is present only while this journey is active. */
  coordinate?: MapCoordinate;
  position?: MockMapPosition;
  isCurrentUser?: boolean;
}

export interface UserJourneyRecord {
  activityId: string;
  title: string;
  status: JourneyStatus;
  distanceKm: number;
  startedAt: string;
  updatedAt: string;
  /** Set while the automatic journey is waiting for the movement window. */
  armedAt?: string;
  /** No movement is evaluated before this time. */
  detectionStartsAt?: string;
  /** Managed by the native background location task rather than a UI watcher. */
  backgroundManaged?: boolean;
  targetCoordinate?: MapCoordinate;
  targetPosition?: MockMapPosition;
  currentCoordinate?: MapCoordinate;
  endsAt?: string;
}

export interface JourneyStartResult {
  ok: boolean;
  conflict?: UserJourneyRecord;
  reason?:
    | 'location-permission'
    | 'location-unavailable'
    | 'background-unavailable'
    | 'destination-required';
}
