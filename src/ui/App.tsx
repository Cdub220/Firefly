/**
 * src/ui — owned by Chase.
 *
 * v0: a truth/belief table with a tick scrubber. The Three.js scene (structure, fire,
 * drones, truth/belief/diff split view) is TODO(Chase). @react-three/fiber is installed.
 */
import { useSim } from './store';

export function App() {
  const { seed, trace, cursor, run, setCursor, setSeed } = useSim();
  const rec = trace[cursor];

  return (
    <div className="min-h-screen p-6 font-mono text-sm">
      <header className="mb-4 flex items-center gap-4">
        <h1 className="text-xl font-bold">Firefly</h1>
        <label className="flex items-center gap-2">
          seed
          <input
            className="w-20 rounded bg-neutral-800 px-2 py-1"
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
          />
        </label>
        <button className="rounded bg-orange-600 px-3 py-1 hover:bg-orange-500" onClick={run}>
          run
        </button>
        {trace.length > 0 && (
          <label className="flex items-center gap-2">
            t={rec?.t}
            <input
              type="range"
              min={0}
              max={trace.length - 1}
              value={cursor}
              onChange={(e) => setCursor(Number(e.target.value))}
            />
          </label>
        )}
      </header>

      {rec ? (
        <div className="grid grid-cols-2 gap-6">
          <section>
            <h2 className="mb-2 font-bold text-neutral-400">truth</h2>
            <table className="w-full">
              <tbody>
                {rec.truth.spaces.map((s) => (
                  <tr key={s.id} className={s.burning ? 'text-orange-400' : ''}>
                    <td>{s.id}</td>
                    <td>L{s.level}</td>
                    <td>{s.temp.toFixed(0)}C</td>
                    <td>{s.burning ? 'BURNING' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section>
            <h2 className="mb-2 font-bold text-neutral-400">
              belief (conf {rec.belief.confidence.toFixed(2)})
            </h2>
            <table className="w-full">
              <tbody>
                {rec.truth.spaces.map((s) => {
                  const est = rec.belief.estimate[s.id] ?? 0;
                  const believedBurning = rec.belief.burningSet.includes(s.id);
                  const wrong = believedBurning !== s.burning;
                  return (
                    <tr key={s.id} className={wrong ? 'text-red-400' : believedBurning ? 'text-orange-400' : ''}>
                      <td>{s.id}</td>
                      <td>{est.toFixed(0)}C</td>
                      <td>{believedBurning ? 'burning' : ''}</td>
                      <td>{wrong ? 'MISMATCH' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rec.belief.ambiguous.length > 0 && (
              <p className="mt-2 text-yellow-400">
                ambiguous: {rec.belief.ambiguous.map((g) => g.join('|')).join('  ')}
              </p>
            )}
          </section>
        </div>
      ) : (
        <p className="text-neutral-500">press run</p>
      )}
    </div>
  );
}
