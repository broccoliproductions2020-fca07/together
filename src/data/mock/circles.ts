export interface MockCircle {
  id: string;
  name: string;
  emoji?: string;
  memberIds: string[];
}

/** Seed circles for `mockCircleService` (circles feature, mock backend only). */
export const mockCircles: MockCircle[] = [
  {
    id: 'c_close',
    name: 'Close Friends',
    emoji: '💛',
    memberIds: ['u_you', 'u_max', 'u_lisa', 'u_tom'],
  },
  {
    id: 'c_uni',
    name: 'Uni',
    emoji: '🎓',
    memberIds: ['u_you', 'u_lena', 'u_theo'],
  },
  {
    id: 'c_sport',
    name: 'Sport',
    emoji: '🏃',
    memberIds: ['u_you', 'u_tom', 'u_david'],
  },
  {
    id: 'c_feiern',
    name: 'Feiern',
    emoji: '🎉',
    memberIds: ['u_you', 'u_jonas', 'u_lisa', 'u_mara', 'u_theo'],
  },
];
