// packages/core/src/types/__tests__/track.test.ts

import { describe, it, expect } from 'vitest';
import type { Track, TrackId } from '../track';

describe('Track type', () => {
  const validTrack: Track = {
    id: 'frontend',
    label: 'Frontend',
    description: 'UI layer and client-side code',
    focusTypes: ['state-management', 'data-flow'],
    confidence: 0.85,
    suggestedOrder: 1,
  };

  it('should create a valid Track object', () => {
    expect(validTrack.id).toBe('frontend');
    expect(validTrack.label).toBe('Frontend');
    expect(validTrack.confidence).toBeGreaterThanOrEqual(0);
    expect(validTrack.confidence).toBeLessThanOrEqual(1);
    expect(validTrack.suggestedOrder).toBeGreaterThanOrEqual(1);
    expect(validTrack.focusTypes).toHaveLength(2);
  });

  it('should allow all 4 track IDs', () => {
    const ids: TrackId[] = ['frontend', 'backend', 'architecture', 'infra'];
    expect(ids).toHaveLength(4);

    for (const id of ids) {
      const track: Track = { ...validTrack, id };
      expect(track.id).toBe(id);
    }
  });

  it('should support TrackId as a literal type', () => {
    const fe: TrackId = 'frontend';
    const be: TrackId = 'backend';
    const arch: TrackId = 'architecture';
    const inf: TrackId = 'infra';
    expect([fe, be, arch, inf]).toEqual(['frontend', 'backend', 'architecture', 'infra']);
  });
});
