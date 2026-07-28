// Structural oracles for limits.ts on OUR humanoid scene, ported from mink's
// tests (pinned 44c8a6ab66d27d06249f9018334a51662605e3e4):
// test_configuration_limit.py (indices, far-from-limit positivity, repulsion
// band, dt-invariance) and test_collision_avoidance_limit.py's constructions,
// plus tests for the custom (non-mink) ComSupportLimit.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POSE_LIBRARY } from '../poses/index';
import sceneXml from '../spike/scene.xml?raw';
import { GateConfiguration } from './configuration';
import { loadGateEngine } from './engine';
import { CollisionAvoidanceLimit, ComSupportLimit, ConfigurationLimit } from './limits';

let engine: Awaited<ReturnType<typeof loadGateEngine>>;
let config: GateConfiguration;

const stanceQ = () => Float64Array.from(POSE_LIBRARY.poses[0]!.qpos);

beforeAll(async () => {
  engine = await loadGateEngine(sceneXml);
  config = new GateConfiguration(engine, stanceQ());
}, 30_000);

afterAll(() => {
  config.dispose();
  engine.dispose();
});

/** max over rows of G·Δq − h (positive means Δq violates the constraint). */
function maxViolation(
  G: Float64Array,
  h: Float64Array,
  count: number,
  nv: number,
  dq: ArrayLike<number>,
): number {
  let worst = -Infinity;
  for (let i = 0; i < count; i++) {
    let s = 0;
    for (let c = 0; c < nv; c++) s += G[i * nv + c]! * (dq[c] as number);
    worst = Math.max(worst, s - h[i]!);
  }
  return worst;
}

describe('ConfigurationLimit (port of test_configuration_limit.py)', () => {
  it('selects exactly the 21 hinge dofs 6..26', () => {
    const limit = new ConfigurationLimit(config);
    expect([...limit.indices]).toEqual(Array.from({ length: 21 }, (_, i) => i + 6));
  });

  it('far from limits every h is strictly positive (test_far_from_limit)', () => {
    config.update(stanceQ());
    const limit = new ConfigurationLimit(config);
    const ineq = limit.computeQpInequalities(config, 1e-3);
    expect(ineq).not.toBeNull();
    const { h, count } = ineq!;
    expect(count).toBe(42);
    for (let i = 0; i < count; i++) expect(h[i]!, `h[${i}]`).toBeGreaterThan(0);
  });

  it('repulsion band: overridden bounds q ∓ slack·dt scale h by the gain', () => {
    // Port of test_configuration_limit_repulsion: gain 0.5, bounds overridden
    // to q ± slack·dt, so every h must sit inside (−slack·dt, +slack·dt).
    config.update(stanceQ());
    const dt = 1e-3;
    const slack = 5e-4; // [rad]/[s]
    const tol = 1e-10;
    const limit = new ConfigurationLimit(config, 0.5);
    const q = config.q;
    for (let i = 0; i < limit.indices.length; i++) {
      const qi = q[limit.qposadrs[i]!]!;
      limit.lower[i] = qi - slack * dt;
      limit.upper[i] = qi + slack * dt;
    }
    const { h, count } = limit.computeQpInequalities(config, dt)!;
    for (let i = 0; i < count; i++) {
      expect(h[i]!).toBeLessThan(slack * dt + tol);
      expect(h[i]!).toBeGreaterThan(-slack * dt - tol);
    }
  });

  it('is dt-invariant: identical G, h at dt=1e-3 and dt=0.2', () => {
    config.update(stanceQ());
    const limit = new ConfigurationLimit(config);
    const a = limit.computeQpInequalities(config, 1e-3)!;
    const b = limit.computeQpInequalities(config, 0.2)!;
    expect(a.count).toBe(b.count);
    for (let i = 0; i < a.G.length; i++) {
      expect(Math.abs(a.G[i]! - b.G[i]!)).toBeLessThanOrEqual(1e-8 + 1e-5 * Math.abs(a.G[i]!));
    }
    for (let i = 0; i < a.h.length; i++) {
      expect(Math.abs(a.h[i]! - b.h[i]!)).toBeLessThanOrEqual(1e-8 + 1e-5 * Math.abs(a.h[i]!));
    }
  });
});

describe('ComSupportLimit (custom, not from mink)', () => {
  it('at stance-clean every h is strictly positive (COM strictly inside)', () => {
    config.update(stanceQ());
    const limit = new ComSupportLimit();
    const ineq = limit.computeQpInequalities(config, 5e-3);
    expect(ineq).not.toBeNull();
    expect(ineq!.count).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < ineq!.count; i++) expect(ineq!.h[i]!, `h[${i}]`).toBeGreaterThan(0);
  });

  it('binds against a Δq that would push the COM out (large hip/trunk lean)', () => {
    config.update(stanceQ());
    const limit = new ComSupportLimit();
    const { G, h, count } = limit.computeQpInequalities(config, 5e-3)!;
    const nv = config.nv;
    // Forward lean: bend the trunk and both hips hard (abdomen_y range is
    // −75°..30°; negative = forward). Linearized through J_com this drives
    // the COM out of the ~10 cm support margin.
    const dq = new Float64Array(nv);
    dq[config.jntDofadr[config.jointId('abdomen_y')]!] = -2.0;
    dq[config.jntDofadr[config.jointId('hip_y_right')]!] = -2.0;
    dq[config.jntDofadr[config.jointId('hip_y_left')]!] = -2.0;
    expect(maxViolation(G, h, count, nv, dq)).toBeGreaterThan(0);
    // Sanity: staying put violates nothing.
    expect(maxViolation(G, h, count, nv, new Float64Array(nv))).toBeLessThan(0);
  });

  it('degenerate hull (< 3 vertices) returns the infeasible marker', () => {
    config.update(stanceQ());
    const limit = new ComSupportLimit({
      footprintFn: () => [
        [0, 0],
        [1, 0],
        [2, 0], // collinear: hull collapses below 3 vertices
      ],
    });
    const ineq = limit.computeQpInequalities(config, 5e-3)!;
    expect(ineq.count).toBe(1);
    expect(ineq.h[0]).toBe(-1);
    for (let i = 0; i < ineq.G.length; i++) expect(ineq.G[i]).toBe(0);
  });
});

describe('CollisionAvoidanceLimit (hand_right vs floor)', () => {
  it('keeps the pair (filters pass) and is loose when far apart', () => {
    config.update(stanceQ());
    const limit = new CollisionAvoidanceLimit(config, [['hand_right', 'floor']]);
    expect(limit.geomIdPairs.length).toBe(1);
    // (min, max) normalization puts the floor (geom 0) first.
    expect(limit.geomIdPairs[0]![0]).toBe(config.geomId('floor'));
    expect(limit.geomIdPairs[0]![1]).toBe(config.geomId('hand_right'));

    const { G, h, count } = limit.computeQpInequalities(config, 1e-2)!;
    expect(count).toBe(1);
    // Hand is ~1.3 m above the floor, beyond the 0.01 m detection distance:
    // upstream leaves the preallocated h = +∞ and a zero G row.
    expect(h[0]).toBe(Infinity);
    for (let i = 0; i < config.nv; i++) expect(G[i]).toBe(0);
  });

  it('tightens near the floor with the source row construction', () => {
    // Lower the root so the hand sphere sits ~8 mm above the floor: inside the
    // 10 mm detection distance, above the 5 mm minimum distance.
    const q = stanceQ();
    config.update(q);
    const handGeom = config.geomId('hand_right');
    const geomXpos = engine.data.geom_xpos as ArrayLike<number>;
    const handZ = geomXpos[3 * handGeom + 2] as number;
    const handRadius = 0.04; // scene.xml hand sphere size
    const targetDist = 0.008;
    q[2] = q[2]! - (handZ - handRadius - targetDist);
    config.update(q);

    const dt = 1e-2;
    const limit = new CollisionAvoidanceLimit(config, [['floor', 'hand_right']]);
    const { G, h, count } = limit.computeQpInequalities(config, dt)!;
    expect(count).toBe(1);
    // h = gain·(dist − minDist)/dt + relaxation, with dist ≈ 8 mm.
    const expected = (0.85 * (targetDist - 0.005)) / dt;
    expect(h[0]!).toBeGreaterThan(0);
    expect(h[0]!).toBeLessThan(Infinity);
    expect(Math.abs(h[0]! - expected)).toBeLessThanOrEqual(0.15 * expected);
    // Row sign per source: pair is (floor, hand), normal points floor → hand
    // (+z), G = −normal·(J_hand − J_floor); the root-z column is −1, so a
    // descending Δq (root z negative) consumes the budget: G·Δq > 0.
    const nv = config.nv;
    expect(G[2]!).toBeCloseTo(-1, 6);
    const descend = new Float64Array(nv);
    descend[2] = -1;
    let s = 0;
    for (let c = 0; c < nv; c++) s += G[c]! * descend[c]!;
    expect(s).toBeGreaterThan(0);
    config.update(stanceQ());
  });

  it('drops a welded/parent-child pair (torso vs floor is parent-child)', () => {
    // The torso body's parent is the world (the floor's body), so upstream's
    // parent-child filter removes the pair entirely.
    const limit = new CollisionAvoidanceLimit(config, [['torso', 'floor']]);
    expect(limit.geomIdPairs.length).toBe(0);
    expect(limit.computeQpInequalities(config, 1e-2)).toBeNull();
  });
});
