import type { Plan } from '@/features/calendar/types/calendar.types';

/** Build an ISO timestamp relative to today so the agenda always has fresh days. */
function planTime(daysFromToday: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

/**
 * Example Together plans for the calendar. Not the device calendar — these are
 * Together-internal plans only. Open signals never appear here automatically.
 */
export const mockPlans: Plan[] = [
  {
    id: 'plan_biergarten',
    activityId: 'cluster-biergarten',
    title: 'Biergarten',
    status: 'confirmed',
    startsAt: planTime(0, 18, 30),
    endsAt: planTime(0, 21, 0),
    locationName: 'Prater Biergarten',
    address: 'Kastanienallee 7–9',
    circleName: 'Close Friends',
    sourceMode: 'soon',
    description: 'Spontan auf ein, zwei Bier im Prater. Wer mag, kommt einfach dazu.',
    people: [
      { id: 'u_max', displayName: 'Max', initials: 'MK' },
      { id: 'u_lisa', displayName: 'Lisa', initials: 'LB' },
      { id: 'u_jonas', displayName: 'Jonas', initials: 'JP' },
    ],
  },
  {
    id: 'plan_kaffee',
    activityId: 'marker-jonas-cafe',
    title: 'Kaffeepause',
    status: 'tentative',
    startsAt: planTime(0, 15, 0),
    locationName: 'Bonanza Coffee',
    circleName: 'Uni',
    description: 'Kurze Lernpause auf einen Flat White.',
    people: [
      { id: 'u_lena', displayName: 'Lena', initials: 'LS' },
      { id: 'u_theo', displayName: 'Theo', initials: 'TR' },
    ],
  },
  {
    id: 'plan_gym',
    activityId: 'marker-lina-bouldering',
    title: 'Gym Session',
    status: 'confirmed',
    startsAt: planTime(1, 10, 0),
    endsAt: planTime(1, 11, 30),
    locationName: 'Boulderhalle Ost',
    circleName: 'Sport',
    people: [
      { id: 'u_tom', displayName: 'Tom', initials: 'TW' },
      { id: 'u_david', displayName: 'David', initials: 'DK' },
    ],
  },
  {
    id: 'plan_lerngruppe',
    activityId: 'plan_lerngruppe',
    title: 'Lerngruppe',
    status: 'invited',
    startsAt: planTime(1, 14, 0),
    locationName: 'Bibliothek',
    circleName: 'Uni',
    description: 'Vorbereitung fürs Statistik-Tutorium. Einladung steht noch offen.',
    people: [
      { id: 'u_mara', displayName: 'Mara', initials: 'MA' },
      { id: 'u_lena', displayName: 'Lena', initials: 'LS' },
    ],
  },
  {
    id: 'plan_bar',
    activityId: 'plan_bar',
    title: 'Bar',
    status: 'interested',
    startsAt: planTime(3, 21, 0),
    locationName: 'Stagger Lee',
    circleName: 'Feiern',
    description: 'Cocktails am Freitag. Noch nicht zugesagt, klingt aber gut.',
    people: [
      { id: 'u_jonas', displayName: 'Jonas', initials: 'JP' },
      { id: 'u_lisa', displayName: 'Lisa', initials: 'LB' },
      { id: 'u_mara', displayName: 'Mara', initials: 'MA' },
      { id: 'u_theo', displayName: 'Theo', initials: 'TR' },
    ],
  },
  {
    id: 'plan_brunch',
    activityId: 'plan_brunch',
    title: 'Sonntagsbrunch',
    status: 'tentative',
    startsAt: planTime(4, 11, 0),
    locationName: 'Café Liebling',
    circleName: 'Close Friends',
    people: [
      { id: 'u_max', displayName: 'Max', initials: 'MK' },
      { id: 'u_lisa', displayName: 'Lisa', initials: 'LB' },
    ],
  },

  // Weiter verteilte Pläne über mehrere Wochen — zum Testen des Wochensprungs
  // in der Wochenleiste beim Durchscrollen der Agenda.
  {
    id: 'plan_wochenmarkt',
    activityId: 'plan_wochenmarkt',
    title: 'Wochenmarkt',
    status: 'tentative',
    startsAt: planTime(6, 11, 0),
    endsAt: planTime(6, 13, 0),
    locationName: 'Markt am Kollwitzplatz',
    circleName: 'Close Friends',
    sourceMode: 'soon',
    people: [
      { id: 'u_lena', displayName: 'Lena', initials: 'LS' },
      { id: 'u_max', displayName: 'Max', initials: 'MK' },
    ],
  },
  {
    id: 'plan_klettern',
    activityId: 'plan_klettern',
    title: 'Klettern',
    status: 'confirmed',
    startsAt: planTime(8, 18, 30),
    endsAt: planTime(8, 20, 30),
    locationName: 'Magic Mountain',
    circleName: 'Sport',
    sourceMode: 'now',
    people: [
      { id: 'u_tom', displayName: 'Tom', initials: 'TW' },
      { id: 'u_david', displayName: 'David', initials: 'DK' },
    ],
  },
  {
    id: 'plan_konzert',
    activityId: 'plan_konzert',
    title: 'Konzert',
    status: 'interested',
    startsAt: planTime(10, 20, 0),
    locationName: 'Astra Kulturhaus',
    circleName: 'Feiern',
    sourceMode: 'soon',
    description: 'Indie-Band, Tickets gibt es noch an der Abendkasse.',
    people: [
      { id: 'u_jonas', displayName: 'Jonas', initials: 'JP' },
      { id: 'u_mara', displayName: 'Mara', initials: 'MA' },
    ],
  },
  {
    id: 'plan_spieleabend',
    activityId: 'plan_spieleabend',
    title: 'Spieleabend',
    status: 'tentative',
    startsAt: planTime(12, 19, 30),
    locationName: 'Bei Theo',
    circleName: 'Close Friends',
    sourceMode: 'soon',
    people: [
      { id: 'u_theo', displayName: 'Theo', initials: 'TR' },
      { id: 'u_lisa', displayName: 'Lisa', initials: 'LB' },
      { id: 'u_lena', displayName: 'Lena', initials: 'LS' },
    ],
  },
  {
    id: 'plan_wandern',
    activityId: 'plan_wandern',
    title: 'Wanderung',
    status: 'confirmed',
    startsAt: planTime(14, 9, 0),
    endsAt: planTime(14, 15, 0),
    locationName: 'Müggelberge',
    circleName: 'Sport',
    sourceMode: 'soon',
    people: [
      { id: 'u_david', displayName: 'David', initials: 'DK' },
      { id: 'u_max', displayName: 'Max', initials: 'MK' },
    ],
  },
  {
    id: 'plan_geburtstag',
    activityId: 'plan_geburtstag',
    title: 'Geburtstag Mara',
    status: 'invited',
    startsAt: planTime(17, 19, 0),
    locationName: 'Prinzenbar',
    circleName: 'Feiern',
    description: 'Mara wird 30 — kommt zahlreich!',
    sourceMode: 'soon',
    people: [
      { id: 'u_mara', displayName: 'Mara', initials: 'MA' },
      { id: 'u_jonas', displayName: 'Jonas', initials: 'JP' },
      { id: 'u_lisa', displayName: 'Lisa', initials: 'LB' },
    ],
  },
  {
    id: 'plan_museum',
    activityId: 'plan_museum',
    title: 'Museumsbesuch',
    status: 'tentative',
    startsAt: planTime(20, 14, 0),
    locationName: 'Hamburger Bahnhof',
    circleName: 'Uni',
    sourceMode: 'soon',
    people: [
      { id: 'u_lena', displayName: 'Lena', initials: 'LS' },
      { id: 'u_theo', displayName: 'Theo', initials: 'TR' },
    ],
  },
  {
    id: 'plan_grillen',
    activityId: 'plan_grillen',
    title: 'Grillen im Park',
    status: 'confirmed',
    startsAt: planTime(23, 17, 0),
    endsAt: planTime(23, 21, 0),
    locationName: 'Treptower Park',
    circleName: 'Close Friends',
    sourceMode: 'soon',
    people: [
      { id: 'u_max', displayName: 'Max', initials: 'MK' },
      { id: 'u_lisa', displayName: 'Lisa', initials: 'LB' },
      { id: 'u_tom', displayName: 'Tom', initials: 'TW' },
    ],
  },
  {
    id: 'plan_staedtetrip',
    activityId: 'plan_staedtetrip',
    title: 'Städtetrip Leipzig',
    status: 'interested',
    startsAt: planTime(27, 8, 0),
    locationName: 'Hauptbahnhof',
    circleName: 'Feiern',
    sourceMode: 'soon',
    people: [
      { id: 'u_jonas', displayName: 'Jonas', initials: 'JP' },
      { id: 'u_mara', displayName: 'Mara', initials: 'MA' },
    ],
  },
  {
    id: 'plan_lesung',
    activityId: 'plan_lesung',
    title: 'Lesung',
    status: 'tentative',
    startsAt: planTime(30, 19, 30),
    locationName: 'Buchhandlung ocelot',
    circleName: 'Uni',
    sourceMode: 'soon',
    people: [{ id: 'u_lena', displayName: 'Lena', initials: 'LS' }],
  },
];
