import { OBJECTIVE } from '@fix-my-shot/basketball';
import { grade } from '@fix-my-shot/scoring';
import { SpikePage } from './spike/SpikePage';

// Smoke wiring of the core loop's package seam: the basketball plugin supplies the
// objective, the sport-agnostic scorer grades it. Real UI (scene, editor, report)
// lands in issues #6–#14.
export function App() {
  // Minimal routing: the engine spike (issue #6) lives behind ?spike so it can be
  // deep-linked and measured without pulling MuJoCo/WASM into the default shell.
  if (new URLSearchParams(window.location.search).has('spike')) {
    return <SpikePage />;
  }

  const result = grade(OBJECTIVE, { 'elbow-flare': 10 });
  return (
    <main>
      <h1>fix-my-shot</h1>
      <p>Scaffold online. Sample form grade through the package seam: {result.score}/100.</p>
      <p>
        <a href="?spike">→ engine spike (issue #6): MuJoCo WASM benchmark</a>
      </p>
    </main>
  );
}
