import { BACKEND } from '@/shared/services/firebase';

import { firebaseSocializeService } from './firebaseSocializeService';
import { mockSocializeService } from './mockSocializeService';
import type { SocializeService } from './socializeService.types';

export const socializeService: SocializeService =
  BACKEND === 'firebase' ? firebaseSocializeService : mockSocializeService;
