import type { Pose } from '@fix-my-shot/core';
import { OBJECTIVE, PHASES } from '@fix-my-shot/basketball';
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

  const followThrough = PHASES.find((phase) => phase.id === 'follow-through');
  const pose: Pose | undefined = followThrough && {
    phase: followThrough,
    jointAngles: {},
    implement: { id: 'ball', position: [0, 0, 0] },
  };
  const report = pose
    ? grade(pose, OBJECTIVE, {
        'terminal-wrist-flexion': true,
        'head-stabilized': true,
        'repeatable-symmetric-geometry': true,
      })
    : undefined;
  return (
    <main>
      <h1>fix-my-shot</h1>
      <p>
        Scaffold online. Sample form grade through the package seam:{' '}
        {report ? `${report.grade}/100` : 'n/a'}.
      </p>
      <p>
        <a href="?spike">→ engine spike (issue #6): MuJoCo WASM benchmark</a>
      </p>
    </main>
  );
}
