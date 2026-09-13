import { describe, expect, it } from 'vitest';
import { cameraGroup, publishPose, resetCameraGroup } from './cameraSync';

describe('cameraSync', () => {
  it('shares one pose slot per group, versioned, with the last writer as owner', () => {
    resetCameraGroup('g');
    const g = cameraGroup('g');
    expect(g.pose).toBeNull();
    expect(cameraGroup('g')).toBe(g);
    publishPose('g', 'truth', { position: [1, 2, 3], target: [0, 0, 0] });
    expect(g.version).toBe(1);
    expect(g.owner).toBe('truth');
    publishPose('g', 'belief', { position: [4, 5, 6], target: [1, 1, 1] });
    expect(g.version).toBe(2);
    expect(g.owner).toBe('belief');
    expect(g.pose).toEqual({ position: [4, 5, 6], target: [1, 1, 1] });
    expect(cameraGroup('other').version).toBe(0);
    resetCameraGroup('g');
    expect(cameraGroup('g')).not.toBe(g);
  });
});
