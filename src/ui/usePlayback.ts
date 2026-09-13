/**
 * The one playback loop. While the store says `playing`, advance the cursor at `speed`
 * ticks per second with requestAnimationFrame; the store's step() stops at the end.
 * Mount once (App does); views only read cursor.
 */
import { useEffect } from 'react';
import { useSim } from './store';

export function usePlayback(): void {
  const playing = useSim((s) => s.playing);
  const speed = useSim((s) => s.speed);
  const hasTrace = useSim((s) => s.trace !== null);
  useEffect(() => {
    if (!playing || !hasTrace) return;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      if (now - last >= 1000 / speed) {
        last = now;
        useSim.getState().step(1);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, hasTrace]);
}
