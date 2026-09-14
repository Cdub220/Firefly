/**
 * Scorecard strip: the four brief metrics for each brain on the current run, the better
 * one bold. Numbers only.
 */
import { useMemo } from 'react';
import { computeMetrics } from '../../eval/metrics';
import type { TickRecord } from '../../loop';
import { better, formatScore, onsetOf, SCORE_KEYS, SCORE_LABEL, scoreOf } from './metrics';
import { sweepRowsFor, type SweepSummary } from '../sweepSummary';
import sweepSummaryJson from '../sweepSummary.json';

const SWEEP = sweepSummaryJson as unknown as SweepSummary;

type Props = { traces: Record<string, TickRecord[]>; left: string; right: string; /** Show the plan's sweep row (means over the whole sweep) under the live run. */ plan?: string | undefined };

/** The plan's row from the committed sweep summary: same brain, this building, every mode, k, target and seed. */
export function SweepRow({ plan, left, right }: { plan: string; left: string; right: string }) {
  const rows = sweepRowsFor(SWEEP, plan, left, right);
  const meta = SWEEP.meta as { seeds?: number[]; ticks?: number; modes?: string[] };
  if (!rows) return <p className="sub sweep-none">no sweep row for {plan} in {SWEEP.source} (run <code>npm run sweep</code>, then <code>npm run gen:sweep-summary</code>)</p>;
  const n = rows[0]?.n ?? 0;
  return (
    <table className="scorecard sweep" aria-label="sweep row">
      <thead><tr><th>sweep · {plan} · {n} cells{meta.seeds ? ` · ${meta.seeds.length} seeds` : ''}{meta.ticks ? ` · ${meta.ticks} ticks` : ''}</th><th>{left}</th><th>{right}</th></tr></thead>
      <tbody>
        {rows.map((r) => {
          const win = better(r.key, r.a, r.b);
          return (
            <tr key={r.key} data-metric={r.key}>
              <th scope="row">{SCORE_LABEL[r.key]}{r.key === 'timeToRecovery' ? ' (mean of recovered)' : ' (mean)'}</th>
              <td className={win === 'a' ? 'win' : ''}>{formatScore(r.key, r.a)}</td>
              <td className={win === 'b' ? 'win' : ''}>{formatScore(r.key, r.b)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Scorecard({ traces, left, right, plan }: Props) {
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
    <>
      <table className="scorecard" aria-label="scorecard">
        <thead><tr><th>this run</th><th>{left}</th><th>{right}</th></tr></thead>
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
      {plan && <SweepRow plan={plan} left={left} right={right} />}
    </>
  );
}
