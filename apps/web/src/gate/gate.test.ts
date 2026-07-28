/* Facade tests: createGate — the reject-and-revert contract issue #10 builds on. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import sceneXml from '../spike/scene.xml?raw';
import { POSE_LIBRARY } from '../poses';
import { createGate, loadGateEngine, type Gate } from './index';

type Engine = Awaited<ReturnType<typeof loadGateEngine>>;

const stanceClean = POSE_LIBRARY.poses.find((p) => p.id === 'stance-clean')!;

describe('createGate facade', () => {
  let engine: Engine;
  let gate: Gate;

  beforeAll(async () => {
    engine = await loadGateEngine(sceneXml);
    gate = createGate(engine);
  }, 30000);

  afterAll(() => {
    gate.dispose();
    engine.dispose();
  });

  it('evaluate() is the authority classifier', () => {
    expect(gate.evaluate(stanceClean.qpos).valid).toBe(true);
  });

  it('accepts a reachable drag and returns a gate-valid, changed pose', () => {
    const config = { frameType: 'geom' as const, frameId: 16 };
    // Current hand_right world position, from the recorded oracle transform
    // (stance-clean), nudged 3 cm up and 2 cm forward.
    const hand = [0.29, -0.34, 0.9];
    const result = gate.project(stanceClean.qpos, {
      ...config,
      position: [hand[0]! + 0.02, hand[1]!, hand[2]! + 0.03],
    });
    expect(result.accepted).toBe(true);
    expect(result.gate.valid).toBe(true);
    expect(result.steps).toBeGreaterThan(0);
    let changed = 0;
    for (let i = 0; i < result.qpos.length; i++) {
      if (Math.abs(result.qpos[i]! - stanceClean.qpos[i]!) > 1e-9) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });

  it('projection from a valid pose stays valid even for an unreachable drag (limits steer, authority confirms)', () => {
    const result = gate.project(stanceClean.qpos, {
      frameType: 'geom',
      frameId: 16,
      position: [1.5, 0, 0.2], // far out of reach
    });
    // Either the limits kept every step feasible (accepted, still valid) or
    // the step was rejected — but an invalid pose must never be returned as accepted.
    if (result.accepted) {
      expect(result.gate.valid).toBe(true);
    } else {
      expect(Array.from(result.qpos)).toEqual(Array.from(Float64Array.from(stanceClean.qpos)));
    }
  });

  it('reverts wholesale when the start pose is already invalid', () => {
    const broken = Float64Array.from(stanceClean.qpos);
    broken[2] = broken[2]! - 0.05; // root 5 cm down: gross floor penetration
    expect(gate.evaluate(broken).valid).toBe(false);
    const result = gate.project(broken, {
      frameType: 'geom',
      frameId: 16,
      position: [0.3, -0.3, 0.9],
    });
    expect(result.accepted).toBe(false);
    // Reject-and-revert: the caller gets their input back, byte for byte.
    expect(Array.from(result.qpos)).toEqual(Array.from(broken));
  });

  it('is deterministic', () => {
    const drag = { frameType: 'geom' as const, frameId: 16, position: [0.31, -0.33, 0.93] };
    const a = gate.project(stanceClean.qpos, drag);
    const b = gate.project(stanceClean.qpos, drag);
    expect(Array.from(a.qpos)).toEqual(Array.from(b.qpos));
    expect(a.steps).toBe(b.steps);
    expect(a.accepted).toBe(b.accepted);
  });
});
