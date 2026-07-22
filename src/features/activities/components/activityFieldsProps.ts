import type { ActivityDraft } from '../types';

/** Shared props for the per-mode schedule field blocks (NowFields, SoonFields). */
export interface ActivityFieldsProps {
  draft: ActivityDraft;
  onChange: (draft: ActivityDraft) => void;
}
