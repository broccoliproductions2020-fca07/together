import { SOCIALIZE_SEED } from '../data/socializeSeed';
import type { MatchMessage } from '../types/socialize.types';
import type { SocializeService } from './socializeService.types';

export const mockSocializeService: SocializeService = {
  async startSession(_actor, session) {
    return session;
  },
  async updateSession(_actor, session) {
    return session;
  },
  async stopSession() {},
  async discover() {
    return SOCIALIZE_SEED;
  },
  async showInterest() {
    return 'interested';
  },
  async getMessages() {
    return [];
  },
  async sendMessage(_actor, targetId, text): Promise<MatchMessage> {
    return { id: `${targetId}-${Date.now()}`, fromMe: true, text, at: Date.now() };
  },
};
