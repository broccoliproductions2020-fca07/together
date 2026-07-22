export type PlanStatus = 'confirmed' | 'tentative' | 'invited' | 'interested';

export interface PlanPerson {
  id: string;
  displayName: string;
  initials: string;
  avatarUrl?: string;
}

export interface Plan {
  id: string;
  /** Stable Together activity/chat room id. Calendar id may differ, this must not. */
  activityId?: string;
  title: string;
  status: PlanStatus;
  /** ISO 8601 */
  startsAt: string;
  /** ISO 8601 */
  endsAt?: string;
  locationName?: string;
  address?: string;
  circleName?: string;
  people: PlanPerson[];
  /** Where the plan originated from, if it grew out of a map signal. */
  sourceMode?: 'open' | 'soon' | 'now';
  description?: string;
}

/** Plans grouped under a single day, ready to render in the agenda. */
export interface AgendaSection {
  /** `yyyy-mm-dd` day key. */
  key: string;
  /** Human label, e.g. "Heute", "Morgen", "Freitag". */
  label: string;
  plans: Plan[];
}
