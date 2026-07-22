import type { DiscoverCard, MatchMessage, SocialSession } from '../types/socialize.types';

export interface SocializeActor {
  uid: string;
  displayName: string;
  initials: string;
}

export interface SocializeService {
  startSession(actor: SocializeActor, session: SocialSession): Promise<SocialSession>;
  updateSession(actor: SocializeActor, session: SocialSession): Promise<SocialSession>;
  stopSession(actor: SocializeActor): Promise<void>;
  discover(actor: SocializeActor): Promise<DiscoverCard[]>;
  showInterest(actor: SocializeActor, targetId: string): Promise<'interested' | 'matched'>;
  getMessages(actor: SocializeActor, targetId: string): Promise<MatchMessage[]>;
  sendMessage(actor: SocializeActor, targetId: string, text: string): Promise<MatchMessage>;
}
