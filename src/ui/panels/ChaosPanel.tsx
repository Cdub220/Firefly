/**
 * Chaos panel, generated from CORRUPTION_SCHEMA. Adding a field to CorruptionConfig and
 * to the schema is all it takes for a new knob to appear here. Presets set a whole config
 * and run. The readout under the panel compares obs against the plan: no truth.
 */
import { DEFAULT_CORRUPTION } from '../../corruption';
import type { CorruptionMode, SpaceId } from '../../shared/types';
import { CORRUPTION_SCHEMA, type NumberField, type SchemaField } from '../corruptionSchema';
import { useSim, type Corr, type CorrPatch } from '../store';
import { presetsFor, sensorReadout } from './presets';

const DEFAULTS = DEFAULT_CORRUPTION as Record<string, number>;

function NumberKnob({ f, value, onChange }: { f: NumberField; value: number | undefined; onChange: (v: number | undefined) => void }) {
  const dflt = DEFAULTS[f.key];
  const effective = value ?? dflt ?? f.min;
  const id = `chaos-${f.key}`;
  const clamp = (v: number): number => (Number.isFinite(v) ? Math.max(f.min, Math.min(f.max, v)) : effective);
  return (
    <label htmlFor={id} title={f.help}>
      <span className="knob-label">{f.label}{f.unit ? ` (${f.unit})` : ''}{value === undefined && <em> default {dflt}</em>}</span>
      <span className="row">
        <input type="range" min={f.min} max={f.max} step={f.step} value={effective} aria-label={`${f.label} slider`} onChange={(e) => onChange(clamp(Number(e.target.value)))} />
        <input id={id} type="number" min={f.min} max={f.max} step={f.step} value={value ?? ''} placeholder={String(dflt ?? '')} onChange={(e) => onChange(e.target.value === '' ? undefined : clamp(Number(e.target.value)))} />
        {value !== undefined && <button type="button" className="tiny" aria-label={`reset ${f.label}`} title="use the default" onClick={() => onChange(undefined)}>×</button>}
      </span>
    </label>
  );
}

function Knob({ f, corr, spaceIds, set }: { f: SchemaField; corr: Corr; spaceIds: SpaceId[]; set: (patch: CorrPatch) => void }) {
  switch (f.kind) {
    case 'enum':
      return (
        <label htmlFor="chaos-mode" title={f.help}>
          <span className="knob-label">{f.label}</span>
          <select id="chaos-mode" value={corr.mode} onChange={(e) => set({ mode: e.target.value as CorruptionMode })}>
            {f.values.map((m) => <option key={m} value={m}>{f.labels[m]}</option>)}
          </select>
        </label>
      );
    case 'int':
    case 'number': {
      const value = corr[f.key];
      return <NumberKnob f={f} value={value} onChange={(v) => set({ [f.key]: v })} />;
    }
    case 'spaces': {
      const target = corr.target ?? [];
      return (
        <div title={f.help}>
          <span className="knob-label">{f.label}{target.length === 0 && <em> any (none selected)</em>}</span>
          <span className="chips">
            {spaceIds.map((id) => {
              const on = target.includes(id);
              return <button key={id} type="button" aria-pressed={on} onClick={() => set({ target: on ? target.filter((x) => x !== id) : [...target, id] })}>{id}</button>;
            })}
          </span>
        </div>
      );
    }
    case 'boolean': {
      const v = Boolean((corr as Record<string, unknown>)[f.key]);
      return (
        <label htmlFor={`chaos-${f.key}`} title={f.help} className="row">
          <input id={`chaos-${f.key}`} type="checkbox" checked={v} onChange={(e) => set({ [f.key]: e.target.checked } as CorrPatch)} />
          <span className="knob-label">{f.label}</span>
        </label>
      );
    }
  }
}

export function ChaosPanel() {
  const s = useSim();
  const spaceIds = s.plan.spaces.map((x) => x.id);
  const presets = presetsFor(s.plan, s.ignition, s.trace, s.corruption);
  const rec = s.trace?.[s.cursor];
  const readout = sensorReadout(s.plan, rec?.obs);

  // The store drops undefined keys and empty targets; see setCorruption.
  const set = (patch: CorrPatch) => s.setCorruption(patch);

  return (
    <section className="panel-box" aria-label="chaos">
      <h2>Break it</h2>
      <div className="presets">
        {presets.map((p) => (
          <button key={p.id} type="button" title={p.help} onClick={() => { useSim.setState({ corruption: p.corruption }); s.run(); }}>{p.label}</button>
        ))}
      </div>
      <div className="knobs">
        {CORRUPTION_SCHEMA.map((f) => <Knob key={f.key} f={f} corr={s.corruption} spaceIds={spaceIds} set={set} />)}
      </div>
      <button type="button" className="primary wide" onClick={s.run}>Run with these settings</button>
      <div className="readout" aria-live="polite">
        {rec ? (
          <>
            <div><strong>{readout.present}</strong> of {readout.total} fixed sensors reporting at t={rec.t}</div>
            <div className={readout.missing.length ? 'missing' : ''}>{readout.missing.length ? `silent: ${readout.missing.join(', ')}` : 'none silent'}</div>
          </>
        ) : <div>Run to see what the brain receives.</div>}
      </div>
    </section>
  );
}
