/**
 * The keyboard map, as a pure function so it is testable under node. App turns the
 * action into store calls. Space plays/pauses everywhere except when the play button
 * itself has focus (it toggles on its own); any other focused button (a beat someone
 * just clicked) must not swallow space, so App prevents its default activation.
 */
import { BEATS, type Beat } from './store';

export type KeyAction =
  | { kind: 'toggle' }
  | { kind: 'step'; delta: 1 | -1 }
  | { kind: 'compare-toggle' }
  | { kind: 'demo-toggle' }
  | { kind: 'beat'; beat: Beat };

export type KeyEventLike = { key: string; tag?: string | undefined; id?: string | undefined; modifier?: boolean | undefined };

const TYPING = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
const PLAY_BUTTON = /play/i;

export function keyAction(e: KeyEventLike): KeyAction | null {
  if (e.modifier) return null; // Cmd/Ctrl/Alt combos belong to the browser
  if (e.tag !== undefined && TYPING.has(e.tag)) return null;
  if (e.key === ' ') return e.tag === 'BUTTON' && PLAY_BUTTON.test(e.id ?? '') ? null : { kind: 'toggle' };
  if (e.key === 'ArrowRight') return { kind: 'step', delta: 1 };
  if (e.key === 'ArrowLeft') return { kind: 'step', delta: -1 };
  if (e.key === 'c' || e.key === 'C') return { kind: 'compare-toggle' };
  if (e.key === 'r' || e.key === 'R') return { kind: 'demo-toggle' };
  const beat = BEATS.find((b) => b.hotkey === e.key);
  return beat ? { kind: 'beat', beat: beat.key } : null;
}
