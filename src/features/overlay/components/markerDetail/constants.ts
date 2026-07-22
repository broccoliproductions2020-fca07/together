import type { ActivityMode } from '@/features/map/types/map.types';

export const MODE_COPY: Record<ActivityMode, { cta: string }> = {
  open: { cta: 'Beitreten' },
  soon: { cta: 'Mitplanen' },
  now: { cta: 'Dazustoßen' },
};
