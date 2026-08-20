import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

import type { ActivityInfo, SelectedPlace } from '@/features/activities';
import type { JourneyActivityContext } from '@/features/journey';

import type {
  ActivitySelectionPreview,
  MapCoordinate,
  MapMarker,
  MapPlaceSelection,
  MapSelection,
  MarkerCluster,
} from '../types/map.types';

export type PlaceSelection = Extract<MapSelection, { type: 'Place' }>;

const UNKNOWN_PLACE_TITLE = 'Ort ohne Namen';

function nativeMapsUrl(coordinate: MapCoordinate, title: string, intent: 'details' | 'route') {
  const { latitude, longitude } = coordinate;
  const encodedTitle = encodeURIComponent(title);
  const encodedCoordinate = `${latitude},${longitude}`;

  if (Platform.OS === 'ios') {
    return intent === 'route'
      ? `http://maps.apple.com/?daddr=${encodedCoordinate}&q=${encodedTitle}`
      : `http://maps.apple.com/?ll=${encodedCoordinate}&q=${encodedTitle}`;
  }

  if (intent === 'route') {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodedCoordinate}&travelmode=walking`;
  }

  return `geo:${encodedCoordinate}?q=${encodedCoordinate}(${encodedTitle})`;
}

export function openNativeMaps(place: PlaceSelection, intent: 'details' | 'route') {
  void Linking.openURL(nativeMapsUrl(place.coordinate, place.title, intent));
}

/**
 * Same hand-off to the OS maps app for anything that is not a Place selection —
 * an Activity carries a target coordinate + place name but is a different
 * entity, so it gets the coordinate form instead of a faked Place object.
 */
export function openNativeMapsAt(
  coordinate: MapCoordinate,
  title: string,
  intent: 'details' | 'route',
) {
  void Linking.openURL(nativeMapsUrl(coordinate, title, intent));
}

function compactAddressParts(parts: (string | null | undefined)[]) {
  const uniqueParts = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return [...new Set(uniqueParts)].join(', ');
}

function formatReverseGeocodedAddress(address: Location.LocationGeocodedAddress) {
  const streetLine = compactAddressParts([address.street, address.streetNumber]);
  const areaLine = compactAddressParts([address.district, address.city]);

  return (
    address.name?.trim() ||
    address.formattedAddress?.trim() ||
    compactAddressParts([streetLine, areaLine, address.country])
  );
}

/** Name and street address of a coordinate, kept apart so the UI can show the
 * address WITHOUT repeating the name it already put in the title. */
/**
 * A coordinate as a human address, via the OS geocoder.
 *
 * `expo-location`'s reverse geocoding is a platform call, not the Places API —
 * no key, no billing, works offline on cached tiles. That is why the composer
 * may resolve an address for the device position without it becoming a cost
 * question. Returns null rather than throwing: no address is a normal outcome
 * (mid-field, at sea, permission just revoked) and never worth an error state.
 */
export async function describeCoordinate(coordinate: MapCoordinate) {
  return reverseGeocodePlace(coordinate);
}

async function reverseGeocodePlace(coordinate: MapCoordinate) {
  try {
    const [address] = await Location.reverseGeocodeAsync(coordinate);
    if (!address) return null;
    const street = compactAddressParts([address.street, address.streetNumber]);
    const area = compactAddressParts([address.district, address.city]);
    const full = address.formattedAddress?.trim() || compactAddressParts([street, area]);
    const title = formatReverseGeocodedAddress(address);
    if (!title) return null;
    return { title, address: full && full !== title ? full : undefined };
  } catch {
    return null;
  }
}

/**
 * A tapped or long-pressed point, as a selection.
 *
 * The subtitle carries a STREET ADDRESS or nothing at all. It used to explain
 * where the data came from — "kostenlos aus der Koordinate erkannt, kein
 * Places-API-Konto nötig", plus the raw lat/lng — which is a note to ourselves
 * about billing, printed under the place name for every user to read. Whether a
 * lookup was free is not something anyone choosing a meeting spot needs to know.
 */
export async function placeToSelection(place: MapPlaceSelection): Promise<MapSelection> {
  const rawTitle = place.title.trim();
  const hasPoiName = place.source === 'poi' && rawTitle !== UNKNOWN_PLACE_TITLE;
  const geocoded = hasPoiName ? null : await reverseGeocodePlace(place.coordinate);

  return {
    type: 'Place',
    title: hasPoiName ? rawTitle : (geocoded?.title ?? UNKNOWN_PLACE_TITLE),
    // A POI tap makes no Details call, so no address exists for it — better an
    // empty line than a filler one.
    subtitle: hasPoiName ? undefined : geocoded?.address,
    coordinate: place.coordinate,
    placeId: place.placeId,
    source: place.source,
  };
}

export function placeSelectionToComposerPlace(place: PlaceSelection): SelectedPlace {
  return {
    id: place.placeId ?? `${place.coordinate.latitude}-${place.coordinate.longitude}`,
    name: place.title === UNKNOWN_PLACE_TITLE ? 'Markierter Ort' : place.title,
    address: place.subtitle,
    latitude: place.coordinate.latitude,
    longitude: place.coordinate.longitude,
    source: 'map',
  };
}

export function coordinateFromSelection(selection: MapSelection | null) {
  if (!selection) return undefined;
  if (selection.type === 'Place') return selection.coordinate;
  if (selection.type === 'Avatar' || selection.type === 'Cluster') {
    return selection.targetCoordinate;
  }
  return undefined;
}

export function infoToActivityPreview(info: ActivityInfo): ActivitySelectionPreview {
  return {
    id: info.id,
    title: info.title,
    subtitle: info.description ?? `${info.participantCount} Teilnehmer`,
    mode: info.mode,
    plannedMode: info.plannedMode,
    participantCount: info.participantCount,
    participants: info.participants,
    targetCoordinate: info.targetCoordinate,
    timeLabel: info.timeLabel,
    placeLabel: info.placeLabel,
    startsAt: info.startsAt,
    endsAt: info.endsAt,
  };
}

export function previewToJourneyContext(
  activity: ActivitySelectionPreview,
): JourneyActivityContext {
  return {
    id: activity.id,
    title: activity.title,
    participants: activity.participants,
    targetCoordinate: activity.targetCoordinate,
    startsAt: activity.startsAt,
    endsAt: activity.endsAt,
  };
}

export function markerToJourneyContext(marker: MapMarker): JourneyActivityContext {
  return {
    id: marker.id,
    title: marker.title ?? marker.label ?? marker.displayName,
    participants: marker.avatars?.length
      ? marker.avatars
      : [
          {
            userId: marker.userId,
            displayName: marker.displayName,
            initials: marker.initials,
            avatarUrl: marker.avatarUrl,
          },
        ],
    targetCoordinate: marker.coordinate,
    startsAt: marker.startsAt,
    endsAt: marker.endsAt,
  };
}

export function clusterToJourneyContext(cluster: MarkerCluster): JourneyActivityContext {
  return {
    id: cluster.id,
    title: cluster.label,
    participants: cluster.avatars,
    targetCoordinate: cluster.coordinate,
    startsAt: cluster.startsAt,
    endsAt: cluster.endsAt,
  };
}
