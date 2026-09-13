/**
 * SVG string builders for the split view. Pure functions of ViewerData; no React, no physics.
 * Mirrors the logic in src/eval/viewer.template.html so the live UI and the exported
 * HTML look identical.
 */
import type { ViewerBelief, ViewerData, ViewerTick } from '../../eval/viewerData';

export const C = {
  ground: '#0e1116', panel: '#151a21', panel2: '#1b212a', line: '#2a3240', ink: '#e6eaf0', ink2: '#aab4c3', muted: '#6f7b8c',
  wrong: '#ff5c5c', uncertain: '#f0b429', ok: '#5dd39e', stale: '#ff8a5c', cold: '#3a4656',
};

type Pos = Record<string, { x: number; y: number }>;
export type Geometry = { pos: Pos; W: number; H: number; CW: number; CH: number };

export function geometry(data: ViewerData): Geometry {
  const ids = data.plan.spaces.map((s) => s.id);
  const ring: Record<string, [number, number]> = { S1: [0, 0], S2: [1, 0], S3: [2, 0], S6: [0, 1], S5: [1, 1], S4: [2, 1] };
  const pos: Pos = {};
  ids.forEach((id, i) => {
    const fixed = ids.length === 6 ? ring[id] : undefined;
    const col = fixed ? fixed[0] : i % 3, row = fixed ? fixed[1] : Math.floor(i / 3);
    pos[id] = { x: 12 + col * 146, y: 12 + row * 134 };
  });
  const CW = 104, CH = 100;
  const cols = Math.min(3, ids.length), rows = Math.ceil(ids.length / 3);
  return { pos, CW, CH, W: 12 + (cols - 1) * 146 + CW + 12, H: 12 + (rows - 1) * 134 + CH + 12 };
}

const hex = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export function tempColor(T: number, ambient: number): string {
  const ramp: Array<[number, number[]]> = [[ambient, hex('#3a4656')], [200, hex('#d9a441')], [450, hex('#e4572e')], [750, hex('#f6e7c1')]];
  if (!(T > ramp[0]![0])) return C.cold;
  for (let i = 1; i < ramp.length; i++) {
    const [hi, hc] = ramp[i]!; const [lo, lc] = ramp[i - 1]!;
    if (T <= hi) { const t = (T - lo) / (hi - lo); return `rgb(${lc.map((c, k) => Math.round(lerp(c, hc[k]!, t))).join(',')})`; }
  }
  return '#f6e7c1';
}
const esc = (s: unknown): string => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

export function edgeLines(data: ViewerData, g: Geometry): string {
  return data.plan.edges.map((e) => {
    const a = g.pos[e.a], b = g.pos[e.b]; if (!a || !b) return '';
    return `<line class="edge ${e.kind}" x1="${a.x + g.CW / 2}" y1="${a.y + g.CH / 2}" x2="${b.x + g.CW / 2}" y2="${b.y + g.CH / 2}"/>`;
  }).join('');
}
export function edgeLabels(data: ViewerData, g: Geometry): string {
  return data.plan.edges.map((e) => {
    const a = g.pos[e.a], b = g.pos[e.b]; if (!a || !b) return '';
    const mx = (a.x + b.x) / 2 + g.CW / 2, my = (a.y + b.y) / 2 + g.CH / 2, txt = `${e.kind} ${e.rate}`, w = txt.length * 5.6 + 10;
    return `<rect x="${mx - w / 2}" y="${my - 7}" width="${w}" height="14" rx="7" fill="${C.ground}" stroke="${C.line}"/><text class="edge-lbl" x="${mx}" y="${my + 3.5}" text-anchor="middle">${esc(txt)}</text>`;
  }).join('');
}

export type CellOpts = {
  state?: 'burning' | 'believed' | 'ambiguous' | '';
  tag?: string; tagColor?: string; verdict?: 'wrong' | '';
  reading?: { sensorId: string; temp: number; t: number; stale?: boolean; lying?: boolean } | { missing: true };
  suspect?: boolean; fuel?: number; prob?: number;
};
export function cell(id: string, T: number, ambient: number, g: Geometry, o: CellOpts): string {
  const p = g.pos[id]!, { CW, CH } = g, barCol = tempColor(T, ambient), ink = C.ink;
  let stroke = C.cold, sw = 1.5, dash = '';
  if (o.state === 'burning' || o.state === 'believed') { stroke = '#e4572e'; sw = 3; }
  if (o.state === 'ambiguous') { stroke = C.uncertain; sw = 2.5; dash = 'stroke-dasharray="6 4"'; }
  if (o.verdict === 'wrong') { stroke = C.wrong; sw = 3.5; dash = ''; }
  const tag = o.tag ? `<text class="tag" x="${p.x + CW - 7}" y="${p.y + 22}" text-anchor="end" fill="${o.tagColor ?? stroke}">${esc(o.tag)}</text>` : '';
  let chip = '';
  if (o.reading) {
    const r = o.reading;
    const missing = 'missing' in r;
    const col = missing ? C.muted : r.stale ? C.stale : r.lying ? C.uncertain : C.ok;
    const txt = missing ? 'no reading' : `${r.sensorId} ${Math.round(r.temp)}° t${r.t}`;
    chip = `<rect x="${p.x + 5}" y="${p.y + CH - 21}" width="${CW - 10}" height="16" rx="3" fill="${C.ground}" stroke="${C.line}"/>` +
      `<text class="chip" x="${p.x + CW / 2}" y="${p.y + CH - 9.5}" text-anchor="middle" fill="${col}" ${o.suspect ? 'text-decoration="line-through"' : ''}>${esc(txt)}${o.suspect ? ' ✕' : ''}</text>`;
  }
  const sub = o.fuel != null
    ? `<text class="chip" x="${p.x + CW / 2}" y="${p.y + 68}" text-anchor="middle" fill="${o.fuel <= 0 ? C.stale : C.ink2}">fuel ${Math.round(o.fuel * 100)}%</text>`
    : o.prob != null
      ? `<text class="chip" x="${p.x + CW / 2}" y="${p.y + 68}" text-anchor="middle" fill="${C.ink2}">P(burning) ${Math.round(o.prob * 100)}%</text>`
      : '';
  return `<g><rect x="${p.x}" y="${p.y}" width="${CW}" height="${CH}" rx="5" fill="${C.panel2}" stroke="${stroke}" stroke-width="${sw}" ${dash}/>` +
    `<rect x="${p.x + 1}" y="${p.y + 1}" width="${CW - 2}" height="7" rx="3" fill="${barCol}"/>` +
    `<text class="id" x="${p.x + 8}" y="${p.y + 22}" fill="${ink}">${esc(id)}</text>${tag}` +
    `<text class="temp" x="${p.x + CW / 2}" y="${p.y + 52}" text-anchor="middle" fill="${ink}">${Math.round(T)}°</text>${sub}${chip}</g>`;
}

export type Verdict = { exact: boolean; covered: boolean; extra: string[]; state: 'ok' | 'wrong' | 'unc' };
export function verdictFor(b: ViewerBelief, truthSet: Set<string>): Verdict {
  const bs = new Set(b.burningSet), amb = new Set(b.ambiguous.flat());
  const covered = [...truthSet].every((s) => bs.has(s) || amb.has(s));
  const exact = bs.size === truthSet.size && [...truthSet].every((s) => bs.has(s));
  const extra = [...bs].filter((s) => !truthSet.has(s));
  return { exact, covered, extra, state: exact ? 'ok' : b.confidence >= 0.9 ? 'wrong' : 'unc' };
}

export function truthSetOf(rec: ViewerTick): Set<string> {
  return new Set(Object.keys(rec.truth).filter((id) => rec.truth[id]!.burning));
}
function readingsBySpace(rec: ViewerTick): Record<string, ViewerTick['readings'][number]> {
  const m: Record<string, ViewerTick['readings'][number]> = {};
  for (const r of rec.readings) if (r.source !== 'drone') m[r.spaceId] = r;
  return m;
}

export function truthSvg(data: ViewerData, g: Geometry, rec: ViewerTick): string {
  const rb = readingsBySpace(rec);
  const cells = data.plan.spaces.map(({ id }) => {
    const tr = rec.truth[id]!, r = rb[id], out = !tr.burning && tr.fuel <= 0;
    const reading = r ? { sensorId: r.sensorId, temp: r.temp, t: r.t, stale: r.t < rec.t, lying: Math.abs(r.temp - tr.temp) > 30 } : { missing: true as const };
    return cell(id, tr.temp, data.ambient, g, { state: tr.burning ? 'burning' : '', tag: tr.burning ? 'BURNING' : out ? 'BURNED OUT' : '', ...(out ? { tagColor: C.stale } : {}), reading, fuel: tr.fuel });
  }).join('');
  return `<svg viewBox="0 0 ${g.W} ${g.H}" role="img" aria-label="ground truth">${edgeLines(data, g)}${cells}${edgeLabels(data, g)}</svg>`;
}

export function brainSvg(data: ViewerData, g: Geometry, rec: ViewerTick, name: string): string {
  const b = rec.brains[name]!, rb = readingsBySpace(rec), truthSet = truthSetOf(rec);
  const bs = new Set(b.burningSet), amb = new Set(b.ambiguous.flat()), sus = new Set(b.suspectSensors);
  const cells = data.plan.spaces.map(({ id }) => {
    const T = b.estimate[id] ?? data.ambient, r = rb[id], truly = truthSet.has(id);
    const reading = r ? { sensorId: r.sensorId, temp: r.temp, t: r.t } : { missing: true as const };
    const o: CellOpts = { reading, suspect: !!(r && sus.has(r.sensorId)) };
    o.state = bs.has(id) ? 'believed' : amb.has(id) ? 'ambiguous' : '';
    o.tag = bs.has(id) ? 'BURNING' : amb.has(id) ? 'MAYBE' : '';
    if (bs.has(id) && !truly) { o.verdict = 'wrong'; o.tag = 'WRONG'; o.tagColor = C.wrong; }
    else if (truly && !bs.has(id) && !amb.has(id)) { o.verdict = 'wrong'; o.tag = 'MISSED'; o.tagColor = C.wrong; }
    if (b.probability && b.probability[id] != null) o.prob = b.probability[id];
    return cell(id, T, data.ambient, g, o);
  }).join('');
  return `<svg viewBox="0 0 ${g.W} ${g.H}" role="img" aria-label="${esc(name)} belief">${edgeLines(data, g)}${cells}${edgeLabels(data, g)}</svg>`;
}

export function brainVerdictHtml(rec: ViewerTick, name: string): string {
  const b = rec.brains[name]!, v = verdictFor(b, truthSetOf(rec));
  const parts = [`Burning: <b>${esc(b.burningSet.join(', ') || 'nothing')}</b>`];
  if (b.ambiguous.length) parts.push(`maybe <b>${esc(b.ambiguous.map((x) => x.join('+')).join(' | '))}</b> (several fire patterns fit the readings)`);
  if (b.suspectSensors.length) parts.push(`distrusts <b>${esc(b.suspectSensors.join(', '))}</b>`);
  let line = parts.join('; ') + '. ';
  if (v.exact) line += `<span style="color:${C.ok}">Matches truth.</span>`;
  else if (v.state === 'wrong') line += `<span style="color:${C.wrong}">Wrong, and ${(b.confidence * 100).toFixed(0)}% sure of it.</span>`;
  else if (v.covered) line += `<span style="color:${C.uncertain}">Not committing, but the real fire is inside its maybe set.</span>`;
  else line += `<span style="color:${C.uncertain}">Wrong, but says so (conf ${b.confidence.toFixed(2)}).</span>`;
  return line;
}
export function truthVerdictHtml(rec: ViewerTick): string {
  const truthSet = truthSetOf(rec);
  const burnedOut = Object.keys(rec.truth).filter((id) => !rec.truth[id]!.burning && rec.truth[id]!.fuel <= 0);
  return `Burning: <b>${esc([...truthSet].join(', ') || 'nothing')}</b>.${burnedOut.length ? ` <b>${esc(burnedOut.join(', '))}</b> ran out of fuel: still hot, no longer burning.` : ''} Chip = what that space’s sensor reported: <span style="color:${C.ok}">honest</span>, <span style="color:${C.uncertain}">off by 30°+</span>, <span style="color:${C.stale}">stale timestamp</span>.`;
}

export function stripSvg(data: ViewerData, cur: number): string {
  const ticks = data.ticks, n = ticks.length, names = data.brainNames;
  const cw = Math.max(6, Math.min(14, Math.floor(1000 / n))), gap = 2, rowH = 44, left = 64, top = 8;
  const width = left + n * (cw + gap) + 8, height = top + names.length * (rowH + 14) + 16;
  let s = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="per-tick verdicts">`;
  names.forEach((name, r) => {
    const y0 = top + r * (rowH + 14);
    s += `<text class="rowlbl" x="0" y="${y0 + rowH / 2 + 4}">${esc(name)}</text><line x1="${left}" y1="${y0 + rowH}" x2="${width - 8}" y2="${y0 + rowH}" stroke="${C.line}"/>`;
    ticks.forEach((rec, i) => {
      const b = rec.brains[name]!, v = verdictFor(b, truthSetOf(rec));
      const h = Math.max(2, b.confidence * rowH), col = v.state === 'ok' ? C.ok : v.state === 'wrong' ? C.wrong : C.uncertain;
      s += `<rect x="${left + i * (cw + gap)}" y="${y0 + rowH - h}" width="${cw}" height="${h}" fill="${col}" data-i="${i}" style="cursor:pointer"><title>t=${rec.t} ${esc(name)}: ${v.exact ? 'matched' : v.state === 'wrong' ? 'confidently wrong' : 'wrong but honest'} · conf ${b.confidence.toFixed(2)}</title></rect>`;
    });
  });
  const oi = data.onset == null ? -1 : ticks.findIndex((r) => r.t === data.onset);
  if (oi >= 0) s += `<line x1="${left + oi * (cw + gap) - 1}" y1="${top}" x2="${left + oi * (cw + gap) - 1}" y2="${height - 16}" stroke="${C.stale}" stroke-dasharray="3 3"/><text class="rowlbl" x="${left + oi * (cw + gap) + 2}" y="${height - 4}" fill="${C.stale}">sensor breaks at t=${data.onset}</text>`;
  if (cur >= 0 && cur < n) s += `<rect x="${left + cur * (cw + gap) - 1}" y="${top - 2}" width="${cw + 2}" height="${height - top - 12}" fill="none" stroke="${C.ink}" stroke-width="1.5"/>`;
  return s + '</svg>';
}
