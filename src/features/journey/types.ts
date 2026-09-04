import type { GeoCoordinate } from '@/domain/geo';
import type { ParticipantPreview } from '@/domain/person';

/**
 * `armed` is deliberately private: the user opted in, but no location has
 * left the device yet. RTDB contains only a short-lived `underway` point;
 * arrival is retained locally without a final coordinate.
 */
export type JourneyStatus = 'armed' | 'underway' | 'arrived' | 'stopped';

export interface JourneyActivityContext {
  id: string;
  title: string;
  participants: ParticipantPreview[];
  /** Exact destination for the live journey stream. */
  targetCoordinate?: GeoCoordinate;
  startsAt?: string;
  endsAt?: string;
}

export interface JourneyParticipant extends ParticipantPreview {
  status: Exclude<JourneyStatus, 'stopped'>;
  distanceKm: number;
  updatedAt: string;
  /** Exact live position. It is present only while this journey is active. */
  coordinate?: GeoCoordinate;
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
  targetCoordinate?: GeoCoordinate;
  currentCoordinate?: GeoCoordinate;
  endsAt?: string;
}

export interface JourneyStartResult {
  ok: boolean;
  conflict?: UserJourneyRecord;
  reason?:
    | 'location-permission'
    | 'location-unavailable'
    | 'background-unavailable'
    | 'destination-required'
    | 'activity-unavailable';
}
