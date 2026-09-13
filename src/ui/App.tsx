/**
 * src/ui — owned by Chase. Dean added the split view (src/ui/split) with Chase's OK so the
 * checkpoint demo has a live truth | ours | kalman page. Chase's Three.js scene can mount
 * as another view here without touching src/ui/split.
 */
import { useEffect } from 'react';
import { SplitView } from './split/SplitView';
import { useSim } from './store';

export function App() {
  const run = useSim((s) => s.run);
  const hasData = useSim((s) => s.data != null);
  useEffect(() => { if (!hasData) run(); }, [hasData, run]);
  return <SplitView />;
}
