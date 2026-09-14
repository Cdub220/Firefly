/**
 * `npm run gen:sweep-summary` — fold results/sweep-latest.json (Dean's full sweep, one row
 * per plan × mode × k × target × seed × brain) into src/ui/sweepSummary.json: per plan and
 * brain, the mean of each scorecard metric over every cell. The scorecard shows the row
 * for the plan on screen next to the live run, so "same brain, different building" has a
 * number behind it without shipping a 7 MB file into the bundle.
 *
 *   npm run gen:sweep-summary                          # reads results/sweep-latest.json
 *   npm run gen:sweep-summary -- --in results/x.json   # another sweep file
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { summarizeSweep, type SweepRow } from './sweepSummary';

const i = process.argv.indexOf('--in');
const src = i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : 'results/sweep-latest.json';
const out = 'src/ui/sweepSummary.json';
const file = JSON.parse(readFileSync(src, 'utf8')) as { meta: Record<string, unknown>; rows: SweepRow[] };
const summary = summarizeSweep(file.rows, { source: src, meta: file.meta });
writeFileSync(out, JSON.stringify(summary, null, 1) + '\n');
console.log(`wrote ${out}: ${summary.plans.length} plans × ${summary.brains.length} brains from ${file.rows.length} rows (${src})`);
