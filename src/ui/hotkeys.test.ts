import { describe, expect, it } from 'vitest';
import { keyAction } from './hotkeys';
import { BEATS } from './store';

describe('keyAction', () => {
  it('maps space, arrows, c, r and the beat digits', () => {
    expect(keyAction({ key: ' ' })).toEqual({ kind: 'toggle' });
    expect(keyAction({ key: 'ArrowRight' })).toEqual({ kind: 'step', delta: 1 });
    expect(keyAction({ key: 'ArrowLeft' })).toEqual({ kind: 'step', delta: -1 });
    expect(keyAction({ key: 'c' })).toEqual({ kind: 'compare-toggle' });
    expect(keyAction({ key: 'C' })).toEqual({ kind: 'compare-toggle' });
    expect(keyAction({ key: 'r' })).toEqual({ kind: 'demo-toggle' });
    for (const b of BEATS) expect(keyAction({ key: b.hotkey })).toEqual({ kind: 'beat', beat: b.key });
    expect(keyAction({ key: '9' })).toBeNull();
    expect(keyAction({ key: 'x' })).toBeNull();
    expect(keyAction({ key: 'Enter' })).toBeNull();
  });

  it('stays out of inputs and browser shortcuts', () => {
    for (const tag of ['INPUT', 'SELECT', 'TEXTAREA']) {
      expect(keyAction({ key: ' ', tag })).toBeNull();
      expect(keyAction({ key: '2', tag })).toBeNull();
      expect(keyAction({ key: 'ArrowRight', tag })).toBeNull();
    }
    expect(keyAction({ key: '2', modifier: true })).toBeNull();
    expect(keyAction({ key: ' ', modifier: true })).toBeNull();
  });

  it('space after clicking a beat button still plays; only the play button keeps space for itself', () => {
    // The stage flow: click "2 Freeze", press space. Focus is on the beat button.
    expect(keyAction({ key: ' ', tag: 'BUTTON', id: '' })).toEqual({ kind: 'toggle' });
    expect(keyAction({ key: ' ', tag: 'BUTTON', id: 'h2h-showdown' })).toEqual({ kind: 'toggle' });
    // The play controls toggle on their own activation; a second toggle would cancel it.
    expect(keyAction({ key: ' ', tag: 'BUTTON', id: 'play' })).toBeNull();
    expect(keyAction({ key: ' ', tag: 'BUTTON', id: 'sc-play' })).toBeNull();
    // Digits on a focused button still run beats.
    expect(keyAction({ key: '3', tag: 'BUTTON', id: 'play' })).toEqual({ kind: 'beat', beat: 'flashover' });
  });
});
