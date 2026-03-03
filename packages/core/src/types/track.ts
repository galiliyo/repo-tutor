// packages/core/src/types/track.ts

import type { ChapterFocus } from './chapter';

export type TrackId = 'frontend' | 'backend' | 'architecture' | 'infra';

export interface Track {
  id: TrackId;
  label: string;
  description: string;
  focusTypes: ChapterFocus[];
  confidence: number;       // 0-1
  suggestedOrder: number;   // recommended learning order
}
