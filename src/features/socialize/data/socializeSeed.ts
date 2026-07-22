import type { DiscoverCard } from '../types/socialize.types';

/**
 * Mock discover feed for the Socialize mode — client-side only, shown while the
 * user is visible. Real data later comes via Cloud Functions (see AGENTS.md:
 * Socialize is never plain client→Firestore).
 */
export const SOCIALIZE_SEED: DiscoverCard[] = [
  {
    id: 'soc_lisa',
    kind: 'person',
    displayName: 'Lisa',
    initials: 'LI',
    distanceLabel: 'unter 1 km',
    note: 'Kaffee oder ein Spaziergang am Kanal — ich bin flexibel ☺️',
    vibes: [
      { label: 'Kaffee', emoji: '☕' },
      { label: 'Spazieren', emoji: '🚶' },
    ],
    autoMatch: true,
    greeting: 'Hey! Lust auf einen Kaffee am Maybachufer? Ich kenne da einen guten Laden ☕',
  },
  {
    id: 'soc_gruppe_kaffee',
    kind: 'group',
    displayName: 'Kaffee-Runde',
    initials: 'KR',
    memberCount: 3,
    distanceLabel: 'ca. 2 km',
    note: 'Wir sitzen zu dritt im Café und quatschen — komm einfach dazu!',
    vibes: [
      { label: 'Kaffee', emoji: '☕' },
      { label: 'Bar', emoji: '🍻' },
    ],
    autoMatch: true,
    greeting: 'Hi! Wir sind im Café Liebling, hinterer Bereich. Komm vorbei, wir sind noch ne Weile hier 👋',
  },
  {
    id: 'soc_jan',
    kind: 'person',
    displayName: 'Jan',
    initials: 'JA',
    distanceLabel: 'ca. 3 km',
    note: 'Jemand Lust auf eine Runde Bouldern? Bin noch Anfänger 🧗',
    vibes: [{ label: 'Sport', emoji: '🏃' }],
  },
  {
    id: 'soc_mia',
    kind: 'person',
    displayName: 'Mia',
    initials: 'MI',
    distanceLabel: 'ca. 4 km',
    note: 'Neu in der Stadt und offen für so ziemlich alles!',
    vibes: [{ label: 'Egal', emoji: '🤷' }],
    autoMatch: true,
    greeting: 'Hey, danke fürs Matchen! Was machst du so heute?',
  },
  {
    id: 'soc_gruppe_lernen',
    kind: 'group',
    displayName: 'Lerngruppe Bib',
    initials: 'LB',
    memberCount: 2,
    distanceLabel: 'unter 1 km',
    note: 'Lernsession in der Bibliothek, danach Kaffee. Motivierte willkommen 📚',
    vibes: [
      { label: 'Lernen', emoji: '📚' },
      { label: 'Kaffee', emoji: '☕' },
    ],
  },
];
