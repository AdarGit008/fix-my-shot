// Budget instrumentation for the engine spike (issue #6 / SPEC §11.7).
//
// Three numbers, three budgets:
//   • re-grade + report ≤ 100 ms   → regradeBenchmark(): edit a DOF, mj_forward,
//                                     read the form quantities, score.
//   • drag interaction  ≥ 30 fps   → fpsStress(): auto-drag under full dynamics.
//   • initial load      ≤ 5 s      → captured by the page (see SpikePage).

import type { MujocoView } from './mujoco-view';
import type { DragStress } from './drag';

export interface GoNoGo {
  budget: string;
  measured: string;
  pass: boolean;
}

export interface RegradeResult {
  iters: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export interface FpsResult {
  durationMs: number;
  frames: number;
  observedFps: number;
  medianFrameMs: number;
  p95FrameMs: number;
  capacityFps: number; // 1000 / median frame CPU time — headroom above vsync
}

export interface LoadResult {
  moduleInitMs: number;
  firstFrameMs: number;
  totalFromNavMs: number;
}

export interface SceneInfo {
  nq: number;
  nv: number;
  nbody: number;
  ngeom: number;
  nu: number;
}

export interface SpikeResults {
  scene: SceneInfo;
  load: LoadResult;
  regrade: RegradeResult;
  drag: FpsResult;
  verdict: { load: GoNoGo; regrade: GoNoGo; drag: GoNoGo; overall: 'GO' | 'NO-GO' };
  note: string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i] ?? 0;
}

export function sceneInfo(view: MujocoView): SceneInfo {
  const m = view.model;
  return { nq: m.nq, nv: m.nv, nbody: m.nbody, ngeom: m.ngeom, nu: m.nu };
}

/**
 * Full re-grade cycle, timed: perturb one joint DOF (an "edit"), mj_forward
 * (re-evaluate the physical state), then read the graded form quantities (joint
 * angles + a support/CoM-style reduction) — the report's real work — and score.
 */
export function regradeBenchmark(view: MujocoView, iters = 2000): RegradeResult {
  const { mj, model, data } = view;
  const nq: number = model.nq;
  const firstJoint = 7; // skip the 7-dof free root; humanoid hinges follow
  const samples: number[] = [];

  // Warm up JIT + caches.
  for (let i = 0; i < 200; i++) mj.mj_forward(model, data);

  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    // 1. edit: nudge one joint within its range
    const dof = firstJoint + (i % Math.max(1, nq - firstJoint - 7));
    data.qpos[dof] = 0.15 * Math.sin(i * 0.03);
    // 2. re-evaluate the physical state
    mj.mj_forward(model, data);
    // 3. report: read the form quantities the heuristic grades, reduce to a score
    let score = 0;
    const qpos = data.qpos;
    for (let j = firstJoint; j < nq; j++) {
      const dev = qpos[j];
      score += dev * dev; // stand-in for per-principle range scoring
    }
    const com = data.subtree_com; // CoM of the root subtree (balance check input)
    score += com[0] * com[0] + com[1] * com[1];
    // consume `score` so the compiler can't elide the work
    if (!Number.isFinite(score)) throw new Error('nan');
    samples.push(performance.now() - t0);
  }

  samples.sort((a, b) => a - b);
  const avg = samples.reduce((s, x) => s + x, 0) / samples.length;
  return {
    iters,
    avgMs: avg,
    p50Ms: percentile(samples, 50),
    p95Ms: percentile(samples, 95),
    maxMs: samples[samples.length - 1] ?? 0,
  };
}

/**
 * Run the auto-drag stress for `durationMs` while the view loop renders, sampling
 * per-frame CPU work. Reports both sustained fps and CPU capacity (1000/median).
 */
export async function fpsStress(
  view: MujocoView,
  stress: DragStress,
  durationMs = 3000,
): Promise<FpsResult> {
  const frameMs: number[] = [];
  stress.start();
  const t0 = performance.now();
  let frames = 0;

  await new Promise<void>((resolve) => {
    const sample = () => {
      frames++;
      frameMs.push(view.stats.frameMs);
      if (performance.now() - t0 >= durationMs) resolve();
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  stress.stop();
  const elapsed = performance.now() - t0;
  const sorted = [...frameMs].sort((a, b) => a - b);
  const median = percentile(sorted, 50) || 0.001;
  return {
    durationMs: Math.round(elapsed),
    frames,
    observedFps: (frames * 1000) / elapsed,
    medianFrameMs: median,
    p95FrameMs: percentile(sorted, 95),
    capacityFps: 1000 / median,
  };
}

export function verdict(
  load: LoadResult,
  regrade: RegradeResult,
  drag: FpsResult,
): SpikeResults['verdict'] {
  const loadGo: GoNoGo = {
    budget: 'initial load ≤ 5000 ms',
    measured: `${load.totalFromNavMs.toFixed(0)} ms`,
    pass: load.totalFromNavMs <= 5000,
  };
  const regradeGo: GoNoGo = {
    budget: 're-grade + report ≤ 100 ms',
    measured: `avg ${regrade.avgMs.toFixed(3)} ms · p95 ${regrade.p95Ms.toFixed(3)} ms`,
    pass: regrade.p95Ms <= 100,
  };
  // Judge drag on CPU capacity (vsync caps observed fps at ~60 headless).
  const dragGo: GoNoGo = {
    budget: 'drag interaction ≥ 30 fps',
    measured: `${drag.capacityFps.toFixed(0)} fps capacity (median frame ${drag.medianFrameMs.toFixed(2)} ms · observed ${drag.observedFps.toFixed(0)} fps)`,
    pass: drag.capacityFps >= 30,
  };
  return {
    load: loadGo,
    regrade: regradeGo,
    drag: dragGo,
    overall: loadGo.pass && regradeGo.pass && dragGo.pass ? 'GO' : 'NO-GO',
  };
}
