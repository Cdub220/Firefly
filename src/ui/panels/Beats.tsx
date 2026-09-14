/**
 * The demo script row: one button per beat, in pitch order, with its hotkey. Shared by
 * every view so the live demo has the same control surface wherever it is. The
 * keyboard handling lives in App.
 */
import { BEATS, useSim } from '../store';

export function Beats({ compact = false }: { compact?: boolean }) {
  const beat = useSim((s) => s.beat);
  const runBeat = useSim((s) => s.runBeat);
  const replay = useSim((s) => s.replay);
  return (
    <div className={'beats' + (compact ? ' compact' : '')} role="group" aria-label="demo script">
      {BEATS.map((b) => (
        <button key={b.key} type="button" aria-pressed={beat === b.key} onClick={(e) => { e.currentTarget.blur(); runBeat(b.key); }} title={replay?.beats.some((r) => r.beat === b.key) ? 'replays the recorded run' : undefined}>
          <kbd>{b.hotkey}</kbd> {b.label}
        </button>
      ))}
    </div>
  );
}
