/**
 * Runtime description of CorruptionConfig, from which the chaos panel is generated.
 *
 * This is the contract between Dean's knobs and Chase's panel. When Dean adds a field to
 * CorruptionConfig, `_exhaustive` below stops compiling until the schema lists it, and the
 * panel renders it with no UI edit. `seed` is excluded: the loop supplies it.
 */
import type { CorruptionConfig, CorruptionMode } from '../shared/types';

export type CorruptionKey = Exclude<keyof CorruptionConfig, 'seed'>;

type Base<K extends CorruptionKey> = { key: K; label: string; help: string };
export type EnumField = Base<'mode'> & { kind: 'enum'; values: readonly CorruptionMode[]; labels: Record<CorruptionMode, string> };
export type NumberField = Base<Exclude<CorruptionKey, 'mode' | 'target'>> & { kind: 'int' | 'number'; min: number; max: number; step: number; unit?: string };
export type SpacesField = Base<'target'> & { kind: 'spaces' };
export type BooleanField = Base<CorruptionKey> & { kind: 'boolean' };
export type SchemaField = EnumField | NumberField | SpacesField | BooleanField;

export const MODES: readonly CorruptionMode[] = ['none', 'freeze', 'blind', 'saturate', 'flashover', 'mixed'];

export const CORRUPTION_SCHEMA: readonly SchemaField[] = [
  {
    key: 'mode', kind: 'enum', values: MODES, label: 'failure mode',
    labels: {
      none: 'none (clean sensors)',
      freeze: 'freeze: keeps its last value',
      blind: 'blind: reads room temperature',
      saturate: 'saturate: pins at a ceiling',
      flashover: 'flashover: every sensor in a hot space dies',
      mixed: 'mixed: all of the above',
    },
    help: 'How the sensors break. Each one is a documented failure class in README.md.',
  },
  { key: 'k', kind: 'int', min: 0, max: 8, step: 1, label: 'how many break', help: 'Budget of sensors that can be frozen or blinded at once.' },
  { key: 'onset', kind: 'int', min: 0, max: 200, step: 1, unit: 'tick', label: 'break at tick', help: 'First tick a failure may begin.' },
  { key: 'target', kind: 'spaces', label: 'which sensors', help: 'Limit breakage to the sensors in these spaces. None selected = any sensor.' },
  { key: 'flashoverTemp', kind: 'number', min: 200, max: 900, step: 10, unit: '°C', label: 'flashover above', help: 'A space hotter than this loses every sensor in it.' },
  { key: 'saturateAt', kind: 'number', min: 100, max: 900, step: 10, unit: '°C', label: 'saturate at', help: 'A saturating sensor pins at this reading.' },
  { key: 'ambient', kind: 'number', min: -20, max: 60, step: 1, unit: '°C', label: 'blind reads', help: 'What a blinded sensor reports. Leave unset for the plan ambient.' },
];

/**
 * Compile-time exhaustiveness: this object must name every CorruptionConfig field except
 * seed, exactly once. Adding a field to the type without adding it here fails typecheck;
 * the test in corruptionSchema.test.ts then checks the schema lists the same keys.
 */
const _exhaustive: Record<CorruptionKey, true> = {
  mode: true,
  k: true,
  onset: true,
  target: true,
  flashoverTemp: true,
  saturateAt: true,
  ambient: true,
};
export const CORRUPTION_KEYS: readonly CorruptionKey[] = Object.keys(_exhaustive) as CorruptionKey[];
