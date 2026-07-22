import type { SafetyLocation, SafetyStatus } from './types';

/** GPS drift and ordinary movement inside a home must not reset stillness. */
export const SAFETY_STATIONARY_RADIUS_METERS = 60;
export const SAFETY_STATIONARY_PROMPT_MS = 45 * 60 * 1000;

const BLUE_PUBLISH_DISTANCE_METERS = 15;
const ALERT_PUBLISH_DISTANCE_METERS = 5;
const BLUE_HEARTBEAT_MS = 2 * 60 * 1000;
const ALERT_HEARTBEAT_MS = 30 * 1000;
const REQUIRED_OUTSIDE_SAMPLES = 2;

export interface SafetyMotionState {
  stationaryAnchor?: SafetyLocation;
  stationarySince?: number;
  outsideRadiusSamples?: number;
  lastObservedLocation?: SafetyLocation;
  lastPublishedLocation?: SafetyLocation;
  lastPublishedAt?: number;
  lastHeartbeatAt?: number;
}

export interface SafetyMotionDecision {
  next: SafetyMotionState;
  /** Initial anchor or confirmed movement: reschedule the 45-minute prompt. */
  stationaryWindowReset: boolean;
  stationaryDueAt: number;
  shouldPublishLocation: boolean;
  shouldHeartbeat: boolean;
}

export function safetyDistanceMeters(a: SafetyLocation, b: SafetyLocation): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = lat2 - lat1;
  const deltaLng = toRadians(b.lng - a.lng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function observeSafetyMotion(
  current: SafetyMotionState | undefined,
  point: SafetyLocation,
  status: SafetyStatus,
  now = Date.now(),
): SafetyMotionDecision {
  const state: SafetyMotionState = { ...(current ?? {}), lastObservedLocation: point };
  let stationaryWindowReset = false;

  if (!state.stationaryAnchor || !state.stationarySince) {
    state.stationaryAnchor = point;
    state.stationarySince = now;
    state.outsideRadiusSamples = 0;
    stationaryWindowReset = true;
  } else {
    const outside =
      safetyDistanceMeters(state.stationaryAnchor, point) > SAFETY_STATIONARY_RADIUS_METERS;
    state.outsideRadiusSamples = outside ? (state.outsideRadiusSamples ?? 0) + 1 : 0;

    // One GPS jump is not movement. Two consecutive fixes outside the 60 m
    // home-sized buffer establish a new anchor and restart the stillness clock.
    if ((state.outsideRadiusSamples ?? 0) >= REQUIRED_OUTSIDE_SAMPLES) {
      state.stationaryAnchor = point;
      state.stationarySince = now;
      state.outsideRadiusSamples = 0;
      stationaryWindowReset = true;
    }
  }

  const urgent = status === 'orange' || status === 'red';
  const publishDistance = urgent ? ALERT_PUBLISH_DISTANCE_METERS : BLUE_PUBLISH_DISTANCE_METERS;
  const shouldPublishLocation =
    !state.lastPublishedLocation ||
    safetyDistanceMeters(state.lastPublishedLocation, point) >= publishDistance;
  const heartbeatInterval = urgent ? ALERT_HEARTBEAT_MS : BLUE_HEARTBEAT_MS;
  const shouldHeartbeat =
    !state.lastHeartbeatAt || now - state.lastHeartbeatAt >= heartbeatInterval;

  return {
    next: state,
    stationaryWindowReset,
    stationaryDueAt: (state.stationarySince ?? now) + SAFETY_STATIONARY_PROMPT_MS,
    shouldPublishLocation,
    shouldHeartbeat,
  };
}

export function markSafetyMotionPublished(
  state: SafetyMotionState,
  point: SafetyLocation | undefined,
  now = Date.now(),
): SafetyMotionState {
  return {
    ...state,
    ...(point ? { lastPublishedLocation: point, lastPublishedAt: now } : {}),
    lastHeartbeatAt: now,
  };
}

export function continueSafetyStationaryWindow(
  state: SafetyMotionState | undefined,
  now = Date.now(),
): SafetyMotionState {
  const anchor = state?.lastObservedLocation ?? state?.stationaryAnchor;
  return {
    ...(state ?? {}),
    ...(anchor ? { stationaryAnchor: anchor } : {}),
    stationarySince: now,
    outsideRadiusSamples: 0,
  };
}
