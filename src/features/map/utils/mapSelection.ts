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

async function reverseGeocodePlaceTitle(coordinate: MapCoordinate) {
  try {
    const [address] = await Location.reverseGeocodeAsync(coordinate);
    return address ? formatReverseGeocodedAddress(address) : null;
  } catch {
    return null;
  }
}

export async function placeToSelection(place: MapPlaceSelection): Promise<MapSelection> {
  const coordinate = `${place.coordinate.latitude.toFixed(5)}, ${place.coordinate.longitude.toFixed(5)}`;
  const rawTitle = place.title.trim();
  const hasPoiName = place.source === 'poi' && rawTitle !== UNKNOWN_PLACE_TITLE;
  const reverseGeocodedTitle = hasPoiName ? null : await reverseGeocodePlaceTitle(place.coordinate);
  const title = hasPoiName ? rawTitle : reverseGeocodedTitle || UNKNOWN_PLACE_TITLE;
  const sourceHint = hasPoiName
    ? 'Von der Karte erkannt. Kostenlose Basisdaten, keine Places-API-Abfrage.'
    : reverseGeocodedTitle
      ? 'Kostenlos aus der Koordinate als Adresse erkannt. Kein Places-API-Konto nötig.'
      : 'Die Karte hat keinen Ortsnamen geliefert. Tippe direkt auf einen Ortsnamen/POI oder öffne Karten.';

  return {
    type: 'Place',
    title,
    subtitle: `${sourceHint} Koordinate: ${coordinate}`,
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
