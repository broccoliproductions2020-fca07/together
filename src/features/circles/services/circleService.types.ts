export interface CircleActor {
  uid: string;
}

/**
 * A private, owner-only list of already confirmed friends. It is never shared
 * with the people in it and it never creates a friendship by itself.
 */
export interface CircleDoc {
  id: string;
  name: string;
  emoji?: string;
  friendUids: string[];
  createdAt: number;
  updatedAt: number;
}

/** Circle backend seam. Friend identity and invitations belong to friends/. */
export interface CircleService {
  /** One-off refresh. Private groups are cached locally by the provider. */
  listCircles(actor: CircleActor): Promise<CircleDoc[]>;
  createCircle(actor: CircleActor, name: string, emoji?: string): Promise<string>;
  setCircleFriends(actor: CircleActor, circleId: string, friendUids: string[]): Promise<void>;
  deleteCircle(actor: CircleActor, circleId: string): Promise<void>;
}
