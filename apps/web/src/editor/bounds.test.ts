/* Physical invariants of the per-phase edit bounds (issue #10, ADR-0009), held
 * against the compiled model + the shipped pose library:
 *  - containment: every shipped pose (clean AND fault-injected — faults are
 *    in-phase bad form) sits inside its phase envelope, ball tether included;
 *  - anatomy: every authored window is inside the model's own joint ranges;
 *  - solvency: resolving never produces an empty window.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PHASES, PHASE_BOUNDS, SHOOTING_HAND_BODY, type PhaseId } from '@fix-my-shot/basketball';

import sceneXml from '../spike/scene.xml?raw';
import { POSE_LIBRARY } from '../poses';
import { GateConfiguration, loadGateEngine } from '../gate';
import { checkPhaseBounds, clampToPhaseBounds, resolvePhaseBounds } from './limits';

type Engine = Awaited<ReturnType<typeof loadGateEngine>>;

const RAD2DEG = 180 / Math.PI;

describe('phase edit bounds vs the compiled model and shipped library', () => {
  let engine: Engine;
  let configuration: GateConfiguration;

  beforeAll(async () => {
    engine = await loadGateEngine(sceneXml);
    configuration = new GateConfiguration(engine);
  }, 30000);

  afterAll(() => {
    configuration.dispose();
    engine.dispose();
  });

  /** World body position at a given qpos (fresh views per call). */
  function bodyPos(qpos: ArrayLike<number>, body: string): [number, number, number] {
    const { mj, model, data } = engine;
    (data.qpos as Float64Array).set(qpos as ArrayLike<number>);
    mj.mj_forward(model, data);
    const id = configuration.bodyId(body);
    const xpos = data.xpos as ArrayLike<number>;
    return [xpos[3 * id] as number, xpos[3 * id + 1] as number, xpos[3 * id + 2] as number];
  }

  it('every authored window sits inside the model anatomical range', () => {
    for (const phase of PHASES) {
      const bounds = PHASE_BOUNDS[phase.id as PhaseId];
      for (const [joint, { minDeg, maxDeg }] of Object.entries(bounds.joints)) {
        const id = configuration.jointId(joint);
        const loDeg = configuration.jntRange[2 * id]! * RAD2DEG;
        const hiDeg = configuration.jntRange[2 * id + 1]! * RAD2DEG;
        expect(minDeg, `${phase.id}/${joint} below model range`).toBeGreaterThanOrEqual(
          loDeg - 1e-6,
        );
        expect(maxDeg, `${phase.id}/${joint} above model range`).toBeLessThanOrEqual(hiDeg + 1e-6);
      }
    }
  });

  it('resolving produces non-empty windows for every phase', () => {
    for (const phase of PHASES) {
      const resolved = resolvePhaseBounds(configuration, PHASE_BOUNDS[phase.id as PhaseId]);
      for (const joint of resolved.joints) {
        expect(joint.loRad, `${phase.id}/${joint.joint} empty after resolve`).toBeLessThan(
          joint.hiRad,
        );
      }
    }
  });

  it('every shipped library pose is inside its phase envelope (joints + ball height)', () => {
    for (const pose of POSE_LIBRARY.poses) {
      const resolved = resolvePhaseBounds(configuration, PHASE_BOUNDS[pose.phase as PhaseId]);
      const violations = checkPhaseBounds(resolved, Float64Array.from(pose.qpos));
      expect(
        violations,
        `${pose.id}: ${violations.map((v) => `${v.parameter}=${v.value.toFixed(4)}∉[${v.lo.toFixed(4)},${v.hi.toFixed(4)}]`).join('; ')}`,
      ).toEqual([]);
    }
  });

  it('every shipped library pose satisfies its phase ball↔hand tether', () => {
    for (const pose of POSE_LIBRARY.poses) {
      const tether = PHASE_BOUNDS[pose.phase as PhaseId].ballHandMaxM;
      const ball = bodyPos(pose.qpos, 'ball');
      const hand = bodyPos(pose.qpos, SHOOTING_HAND_BODY);
      const dist = Math.hypot(ball[0] - hand[0], ball[1] - hand[1], ball[2] - hand[2]);
      expect(dist, `${pose.id}: ball ${dist.toFixed(3)} m from hand`).toBeLessThanOrEqual(tether);
    }
  });

  it('clampToPhaseBounds repairs violations and is idempotent', () => {
    const stance = POSE_LIBRARY.poses.find((p) => p.id === 'stance-clean')!;
    const resolved = resolvePhaseBounds(configuration, PHASE_BOUNDS['stance']);
    const broken = Float64Array.from(stance.qpos);
    const knee = resolved.joints.find((j) => j.joint === 'knee_right')!;
    broken[knee.qposAdr] = -100 * (Math.PI / 180); // far below the stance window
    broken[resolved.ballZ.qposAdr] = 0.3; // ball near the floor
    expect(checkPhaseBounds(resolved, broken).length).toBeGreaterThanOrEqual(2);

    const clamped = clampToPhaseBounds(resolved, broken);
    expect(checkPhaseBounds(resolved, clamped)).toEqual([]);
    expect(Array.from(clampToPhaseBounds(resolved, clamped))).toEqual(Array.from(clamped));
    // Clamping touches only the violated parameters.
    let untouched = 0;
    for (let i = 0; i < broken.length; i++) {
      if (broken[i] === clamped[i]) untouched++;
    }
    expect(untouched).toBe(broken.length - 2);
  });
});
