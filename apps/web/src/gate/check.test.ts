// Gate acceptance + rejection tests (issue #9). The cross-language contract under
// test: every pose tools/posegen/gate.py shipped as valid must also pass this TS
// gate, and surgical tampers must fail exactly the check they break.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POSE_LIBRARY } from '../poses/index';
import sceneXml from '../spike/scene.xml?raw';
import { MAX_PENETRATION_M, convexHull, evaluateQpos, pointInHull } from './check';
import { loadGateEngine, type GateEngine } from './engine';

const DEG2RAD = Math.PI / 180;

let engine: Awaited<ReturnType<typeof loadGateEngine>>;

beforeAll(async () => {
  engine = await loadGateEngine(sceneXml);
}, 20_000);

afterAll(() => {
  engine.dispose();
});

/** qpos address + range (deg) of a named joint, via the model's name table. */
function jointInfo(e: GateEngine, name: string): { adr: number; loDeg: number; hiDeg: number } {
  const jid = e.mj.mj_name2id(e.model, e.mj.mjtObj.mjOBJ_JOINT.value, name);
  if (jid < 0) throw new Error(`joint '${name}' not found`);
  return {
    adr: e.model.jnt_qposadr[jid] as number,
    loDeg: (e.model.jnt_range[2 * jid] as number) / DEG2RAD,
    hiDeg: (e.model.jnt_range[2 * jid + 1] as number) / DEG2RAD,
  };
}

function cleanQpos(): number[] {
  const pose = POSE_LIBRARY.poses.find((p) => p.kind === 'clean');
  if (!pose) throw new Error('pose library has no clean pose');
  return [...pose.qpos];
}

describe('gate acceptance — the shipped pose library', () => {
  it('passes all 33 library poses and reproduces their stored penetration', () => {
    expect(POSE_LIBRARY.poses).toHaveLength(33);
    for (const pose of POSE_LIBRARY.poses) {
      const gate = evaluateQpos(engine, pose.qpos);
      expect(gate.jointLimits, pose.id).toBe(true);
      expect(gate.comInSupport, pose.id).toBe(true);
      expect(gate.valid, pose.id).toBe(true);
      expect(gate.maxPenetrationM, pose.id).toBeLessThanOrEqual(MAX_PENETRATION_M);
      // Same MuJoCo 3.10.0 on both sides; the stored value is gate.py's
      // round(pen, 5). Observed max |Δ| ≈ 5.8e-7 across the library.
      expect(
        Math.abs(gate.maxPenetrationM - pose.gate.maxPenetrationM),
        pose.id,
      ).toBeLessThanOrEqual(1e-5);
    }
  }, 20_000);
});

describe('gate rejection — tampered poses', () => {
  it('rejects a knee pushed 2° below its range minimum', () => {
    const { adr, loDeg } = jointInfo(engine, 'knee_right');
    const q = cleanQpos();
    q[adr] = (loDeg - 2) * DEG2RAD;
    const gate = evaluateQpos(engine, q);
    expect(gate.jointLimits).toBe(false);
    expect(gate.valid).toBe(false);
  });

  it('keeps a knee 0.3° below range-min (inside the 0.5° slack)', () => {
    const { adr, loDeg } = jointInfo(engine, 'knee_right');
    const q = cleanQpos();
    q[adr] = (loDeg - 0.3) * DEG2RAD;
    expect(evaluateQpos(engine, q).jointLimits).toBe(true);
  });

  it('rejects a trunk leaned far forward (COM leaves the support hull)', () => {
    // A root-x translation cannot break comInSupport: the feet translate with the
    // root, so the support hull follows the COM (see the next test). What the check
    // exists to catch is mass moving relative to the feet — a hard trunk lean.
    const { adr, loDeg } = jointInfo(engine, 'abdomen_y');
    expect(loDeg).toBeLessThanOrEqual(-40); // -40° is inside the joint's range
    const q = cleanQpos();
    q[adr] = -40 * DEG2RAD;
    const gate = evaluateQpos(engine, q);
    expect(gate.jointLimits).toBe(true);
    expect(gate.comInSupport).toBe(false);
    expect(gate.valid).toBe(false);
  });

  it('stays balanced under a pure root-x translation (hull moves with the feet)', () => {
    const q = cleanQpos();
    q[0] = (q[0] as number) + 0.5;
    expect(evaluateQpos(engine, q).comInSupport).toBe(true);
  });

  it('rejects a root lowered 2 cm into the floor (penetration beyond ε)', () => {
    const q = cleanQpos();
    q[2] = (q[2] as number) - 0.02;
    const gate = evaluateQpos(engine, q);
    expect(gate.maxPenetrationM).toBeGreaterThan(MAX_PENETRATION_M);
    expect(gate.valid).toBe(false);
  });

  it('keeps a pose whose penetration approaches ε from below (inclusive bound)', () => {
    // No shipped pose sits near the 5e-3 boundary (every stored maxPenetrationM is
    // 0.001), so construct one: lowering the root 3.5 mm turns the clean pose's
    // ~1 mm grounding contact into ~4.5 mm — inside tolerance, so it must stay valid.
    const q = cleanQpos();
    q[2] = (q[2] as number) - 0.0035;
    const gate = evaluateQpos(engine, q);
    expect(gate.maxPenetrationM).toBeGreaterThan(1e-3);
    expect(gate.maxPenetrationM).toBeLessThanOrEqual(MAX_PENETRATION_M);
    expect(gate.valid).toBe(true);
  });
});

describe('hull helpers (degenerate support cases)', () => {
  it('collinear points collapse below 3 hull vertices and contain nothing', () => {
    const hull = convexHull([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(hull.length).toBeLessThan(3);
    expect(pointInHull([1, 0], hull)).toBe(false);
  });

  it('square hull contains interior and boundary points, rejects exterior', () => {
    const hull = convexHull([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0.5, 0.5], // interior point must not survive to the hull
    ]);
    expect(hull).toHaveLength(4);
    expect(pointInHull([0.5, 0.5], hull)).toBe(true);
    expect(pointInHull([0.5, 0], hull)).toBe(true); // exactly on an edge
    expect(pointInHull([0.5, -1e-7], hull)).toBe(true); // inside the 1e-6 band
    expect(pointInHull([1.5, 0.5], hull)).toBe(false);
    expect(pointInHull([0.5, -0.01], hull)).toBe(false);
  });
});

describe('engine lifecycle', () => {
  it('load → evaluate → dispose does not throw, and dispose is idempotent', async () => {
    const own = await loadGateEngine(sceneXml);
    expect(evaluateQpos(own, cleanQpos()).valid).toBe(true);
    expect(() => own.dispose()).not.toThrow();
    expect(() => own.dispose()).not.toThrow();
  }, 20_000);

  it('sustains 200 evaluations (contact handles freed every call)', () => {
    const q = cleanQpos();
    for (let i = 0; i < 200; i++) {
      expect(evaluateQpos(engine, q).valid).toBe(true);
    }
  }, 20_000);
});
