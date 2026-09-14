/**
 * Containment counter: spaces burning in truth over ticks, one curve per driving brain,
 * with markers at the cursor and at corruption onset. Plain SVG.
 */
import { containmentSeries } from './metrics';
import type { TickRecord } from '../../loop';

export const CURVE_COLORS: Record<string, string> = { kalman: '#ff5c5c', ours: '#5dd39e' };
const LABEL: Record<string, string> = { kalman: 'Kalman driving', ours: 'ours driving' };

type Props = {
  /** Trace per driving brain. */
  runs: Record<string, TickRecord[]>;
  cursor: number;
  onset: number | null;
  spaces: number;
  width?: number;
  height?: number;
  /** Legend text per run, when the default "<brain> driving" would be wrong (an open-loop trace). */
  labels?: Record<string, string> | undefined;
};

export function ContainmentChart({ runs, cursor, onset, spaces, width = 640, height = 150, labels }: Props) {
  // Kalman first so the ours curve is drawn on top when the two coincide.
  const names = Object.keys(runs).sort((a, b) => (a === 'kalman' ? -1 : b === 'kalman' ? 1 : 0));
  const series = names.map((n) => ({ name: n, y: containmentSeries(runs[n]!) }));
  const n = Math.max(1, ...series.map((s) => s.y.length));
  const pad = { l: 34, r: 12, t: 10, b: 22 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * w);
  const y = (v: number) => pad.t + h - (spaces <= 0 ? 0 : (v / spaces) * h);
  const path = (ys: number[]) => ys.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticks = [0, Math.round(spaces / 2), spaces];

  return (
    <svg className="containment" viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="spaces burning in truth over time, one curve per driving brain">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke="#2a3240" strokeWidth={1} />
          <text x={pad.l - 6} y={y(v) + 4} fontSize={10} textAnchor="end" fill="#aab4c3">{v}</text>
        </g>
      ))}
      <text x={pad.l} y={height - 6} fontSize={10} fill="#6f7b8c">t=1</text>
      <text x={width - pad.r} y={height - 6} fontSize={10} textAnchor="end" fill="#6f7b8c">t={n}</text>
      {onset !== null && onset >= 1 && onset <= n && (
        <g>
          <line x1={x(onset - 1)} x2={x(onset - 1)} y1={pad.t} y2={pad.t + h} stroke="#f0b429" strokeDasharray="3 3" />
          <text x={x(onset - 1) + 3} y={pad.t + h - 4} fontSize={10} fill="#f0b429">sensors break</text>
        </g>
      )}
      {series.map((s) => (
        <path key={s.name} d={path(s.y)} fill="none" stroke={CURVE_COLORS[s.name] ?? '#a78bfa'} strokeWidth={2} data-series={s.name} />
      ))}
      {cursor >= 0 && cursor < n && <line x1={x(cursor)} x2={x(cursor)} y1={pad.t} y2={pad.t + h} stroke="#e6eaf0" strokeWidth={1.5} data-cursor="1" />}
      {series.map((s, i) => (
        <g key={`legend:${s.name}`} transform={`translate(${pad.l + 8 + i * 150}, ${pad.t + 12})`}>
          <line x1={0} x2={18} y1={0} y2={0} stroke={CURVE_COLORS[s.name] ?? '#a78bfa'} strokeWidth={3} />
          <text x={24} y={4} fontSize={11} fill="#e6eaf0">{labels?.[s.name] ?? LABEL[s.name] ?? s.name} · now {s.y[Math.min(cursor, s.y.length - 1)] ?? 0}</text>
        </g>
      ))}
    </svg>
  );
}
