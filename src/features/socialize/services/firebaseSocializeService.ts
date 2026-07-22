import { httpsCallable } from '@react-native-firebase/functions';

import { getFirebaseFunctions } from '@/shared/services/firebase';

import type { DiscoverCard, MatchMessage, SocialSession } from '../types/socialize.types';
import type { SocializeService } from './socializeService.types';

function call<TInput, TOutput>(name: string) {
  return httpsCallable<TInput, TOutput>(getFirebaseFunctions(), name);
}

export const firebaseSocializeService: SocializeService = {
  async startSession(actor, session) {
    const result = await call<
      { session: SocialSession; displayName: string; initials: string },
      { session: SocialSession }
    >('startSocialSession')({ session, displayName: actor.displayName, initials: actor.initials });
    return result.data.session;
  },
  async updateSession(_actor, session) {
    const result = await call<{ session: SocialSession }, { session: SocialSession }>(
      'updateSocialSession',
    )({ session });
    return result.data.session;
  },
  async stopSession(_actor) {
    await call<undefined, { ok: true }>('stopSocialSession')();
  },
  async discover(_actor) {
    const result = await call<undefined, { cards: DiscoverCard[] }>('discoverSocial')();
    return result.data.cards;
  },
  async showInterest(_actor, targetId) {
    const result = await call<{ targetId: string }, { state: 'interested' | 'matched' }>(
      'showSocialInterest',
    )({ targetId });
    return result.data.state;
  },
  async getMessages(_actor, targetId) {
    const result = await call<{ targetId: string }, { messages: MatchMessage[] }>(
      'getSocialMessages',
    )({ targetId });
    return result.data.messages;
  },
  async sendMessage(actor, targetId, text) {
    const result = await call<
      { targetId: string; text: string; displayName: string; initials: string },
      { message: MatchMessage }
    >('sendSocialMessage')({
      targetId,
      text,
      displayName: actor.displayName,
      initials: actor.initials,
    });
    return result.data.message;
  },
};
