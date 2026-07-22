import type { ActivitySelectionPreview, MapSelection } from '@/features/map/types/map.types';

export type ActivitySelection = ActivitySelectionPreview & {
  type: 'Avatar' | 'Cluster';
  hostName?: string;
};

export function isActivitySelection(selection: MapSelection | null): ActivitySelection | null {
  if (!selection) return null;
  return selection.type === 'Avatar' || selection.type === 'Cluster' ? selection : null;
}
