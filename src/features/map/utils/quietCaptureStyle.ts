import type { GoogleMapStyle } from './sunMapStyles';

/**
 * Extra map rules for the MARKETING CAPTURES ONLY — never for real use.
 *
 * A real map earns its clutter: the parking "P", the tram stop and the
 * restaurant pin are all things a person on their way somewhere actually
 * needs. In a still marketing image none of them are reachable, so they stop
 * being information and become noise competing with the activity markers,
 * which are the only thing the picture is about.
 *
 * Deliberately narrow:
 *
 * - **Only LABELS go, never geometry.** The park stays green and the campus
 *   stays its own shade — the ground is what makes the city read as a city.
 *   Hiding the fills as well would leave a street diagram, not a map.
 * - **Road names stay.** They are what tells a viewer this is a real place in
 *   a real town rather than a mock-up. Only the road SHIELDS go (the little
 *   motorway-number badges), because they are icons, not names.
 * - Transit goes completely: a stop icon with no label is a dot nobody can
 *   read, and the lines are the busiest thing on the ground after the roads.
 *
 * ## Why this is appended and not merged into the palettes
 *
 * `blendSunMapStyles` pairs entries BY ARRAY INDEX, so the four solar
 * palettes must keep identical rules in identical order (AGENTS.md → map
 * style). Adding anything inside them would mean editing all four in place
 * and re-checking every transition. Google applies a style array in order and
 * later rules win, so appending after the blend leaves the whole solar system
 * untouched and cannot desynchronise a transition.
 */
export const QUIET_CAPTURE_STYLE: GoogleMapStyle = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  // Stadtteilnamen in Versalien ("GEORGS-KREUZVIERTEL") tauchen erst beim
  // Herauszoomen auf und sind dann das Lauteste im Bild. Der Stadtname bleibt.
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
];

/**
 * Off unless a capture run explicitly asks for it.
 *
 * Two locks, because a marketing-only view of the map must never reach a
 * user: the flag is read from the environment at bundle time AND gated on
 * `__DEV__`, so a release build cannot switch it on even if the variable is
 * set. Turn it on with `npm run screens:metro`.
 */
export const QUIET_MAP_CAPTURE = __DEV__ && process.env.EXPO_PUBLIC_QUIET_MAP === '1';

/**
 * How far a capture run pulls the camera back.
 *
 * The marketing map wants two things at once: activities spread across the
 * frame, and enough city visible around them that the picture reads as a real
 * place. At the app's normal focus zoom the markers already touch the search
 * bar and the Core — there is no room left to spread INTO. Zooming out buys
 * both at once, and it is free here: `zoomProgressForDelta` keeps a marker at
 * its full unfolded form (four faces plus title) until `latitudeDelta` 0.038,
 * while the focus zoom is 0.006. A factor of 1.45 lands at 0.0087 — still four
 * times inside the threshold, so the markers look exactly as they do in the
 * app.
 *
 * 1.8 was tried and reverted: past roughly 0.010 Google stops drawing the 3D
 * buildings, and the city goes from a modelled block plan to flat dark
 * patches. The extra ground was not worth losing what makes the map look like
 * a place.
 *
 * The seeded scene is spread by the SAME factor (`scripts/lib/seed-scenarios`),
 * so the composition stays as designed and only the surrounding city grows.
 */
export const CAPTURE_ZOOM_OUT = QUIET_MAP_CAPTURE ? 1.45 : 1;
