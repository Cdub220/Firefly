/**
 * Scorecard strip: the four brief metrics for each brain on the current run, the better
 * one bold. Numbers only.
 */
import { useMemo } from 'react';
import { computeMetrics } from '../../eval/metrics';
import type { TickRecord } from '../../loop';
import { better, formatScore, onsetOf, SCORE_KEYS, SCORE_LABEL, scoreOf } from './metrics';

type Props = { traces: Record<string, TickRecord[]>; left: string; right: string };

export function Scorecard({ traces, left, right }: Props) {
  const rows = useMemo(() => {
    const a = traces[left];
    const b = traces[right];
    if (!a || !b || a.length === 0 || b.length === 0) return null;
    const ma = computeMetrics(a, { onset: onsetOf(a) });
    const mb = computeMetrics(b, { onset: onsetOf(b) });
    return SCORE_KEYS.map((key) => {
      const va = scoreOf(ma, key);
      const vb = scoreOf(mb, key);
      return { key, label: SCORE_LABEL[key], a: formatScore(key, va), b: formatScore(key, vb), win: better(key, va, vb) };
    });
  }, [traces, left, right]);
  if (!rows) return null;
  return (
    <table className="scorecard" aria-label="scorecard">
      <thead><tr><th></th><th>{left}</th><th>{right}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} data-metric={r.key}>
            <th scope="row">{r.label}</th>
            <td className={r.win === 'a' ? 'win' : ''}>{r.a}</td>
            <td className={r.win === 'b' ? 'win' : ''}>{r.b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
