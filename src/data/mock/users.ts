export interface MockUser {
  id: string;
  /** Short handle used to derive the mock circle-invite username. */
  name: string;
  displayName?: string;
}

/** Seed users for `mockCircleService` (circles feature, mock backend only). */
export const mockUsers: MockUser[] = [
  { id: 'u_max', name: 'Max', displayName: 'Max' },
  { id: 'u_lisa', name: 'Lisa', displayName: 'Lisa' },
  { id: 'u_jonas', name: 'Jonas', displayName: 'Jonas' },
  { id: 'u_lena', name: 'Lena', displayName: 'Lena' },
  { id: 'u_theo', name: 'Theo', displayName: 'Theo' },
  { id: 'u_tom', name: 'Tom', displayName: 'Tom' },
  { id: 'u_david', name: 'David', displayName: 'David' },
  { id: 'u_mara', name: 'Mara', displayName: 'Mara' },
];
