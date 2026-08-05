/* Behavior of the phase-envelope limits under real gate projections (issue #10):
 * the same drags that escape a phase without the limits stay inside it with
 * them, the ball is height-banded and tethered to the shooting hand from both
 * directions, and everything remains deterministic and gate-valid.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PHASE_BOUNDS, SHOOTING_HAND_BODY, type PhaseId } from '@fix-my-shot/basketball';

import sceneXml from '../spike/scene.xml?raw';
import { POSE_LIBRARY, type LibraryPose } from '../poses';
import {
  CollisionAvoidanceLimit,
  GateConfiguration,
  createGate,
  loadGateEngine,
  type Gate,
} from '../gate';
import {
  BallTetherLimit,
  EDITOR_COLLISION_PAIRS,
  PhaseBoundLimit,
  checkPhaseBounds,
  resolvePhaseBounds,
  type ResolvedPhaseBounds,
} from './limits';
import { createBoundsProvider, type BoundsProvider } from './session';

type Engine = Awaited<ReturnType<typeof loadGateEngine>>;

const pose = (id: string): LibraryPose => {
  const found = POSE_LIBRARY.poses.find((p) => p.id === id);
  if (!found) throw new Error(`library pose '${id}' missing`);
  return found;
};

describe('PhaseBoundLimit + BallTetherLimit under projection', () => {
  let engine: Engine;
  let configuration: GateConfiguration;
  let gate: Gate;

  beforeAll(async () => {
    engine = await loadGateEngine(sceneXml);
    configuration = new GateConfiguration(engine);
    gate = createGate(engine);
  }, 30000);

  afterAll(() => {
    gate.dispose();
    configuration.dispose();
    engine.dispose();
  });

  function resolved(phase: PhaseId): ResolvedPhaseBounds {
    return resolvePhaseBounds(configuration, PHASE_BOUNDS[phase]);
  }

  function limitsFor(phase: PhaseId) {
    const r = resolved(phase);
    return {
      resolved: r,
      limits: [
        new PhaseBoundLimit(r),
        new BallTetherLimit(configuration, {
          ballBody: 'ball',
          handBody: SHOOTING_HAND_BODY,
          maxDistM: r.ballHandMaxM,
        }),
      ],
    };
  }

  function bodyPos(qpos: ArrayLike<number>, body: string): [number, number, number] {
    const { mj, model, data } = engine;
    (data.qpos as Float64Array).set(qpos as ArrayLike<number>);
    mj.mj_forward(model, data);
    const id = configuration.bodyId(body);
    const xpos = data.xpos as ArrayLike<number>;
    return [xpos[3 * id] as number, xpos[3 * id + 1] as number, xpos[3 * id + 2] as number];
  }

  function geomIdOf(name: string): number {
    return configuration.geomId(name);
  }

  it('a hand drag that escapes the dip envelope without the limits stays inside with them', () => {
    const dip = pose('dip-clean');
    const start = bodyPos(dip.qpos, SHOOTING_HAND_BODY);
    // Pull the shooting hand far up and back: without phase bounds this recruits
    // the shoulder past the dip window (the model allows -85°, the dip stops at -80°).
    const target = [start[0] - 0.15, start[1], start[2] + 0.55];
    const drag = { frameType: 'geom' as const, frameId: geomIdOf('hand_right') };

    const { resolved: r, limits } = limitsFor('dip');
    const unbounded = gate.project(dip.qpos, { ...drag, position: target });
    expect(unbounded.accepted).toBe(true);
    expect(
      checkPhaseBounds(r, unbounded.qpos).length,
      'test drag too weak: it never leaves the dip envelope even unbounded',
    ).toBeGreaterThan(0);

    const bounded = gate.project(dip.qpos, { ...drag, position: target }, { extraLimits: limits });
    expect(bounded.accepted).toBe(true);
    expect(bounded.gate.valid).toBe(true);
    expect(checkPhaseBounds(r, bounded.qpos)).toEqual([]);
  });

  it('the ball cannot be dragged below the set-release height band', () => {
    const set = pose('set-release-clean');
    const { resolved: r, limits } = limitsFor('set-release');
    const ballStart = bodyPos(set.qpos, 'ball');
    const result = gate.project(
      set.qpos,
      { frameType: 'geom', frameId: geomIdOf('ball'), position: [ballStart[0], ballStart[1], 0.4] },
      { extraLimits: limits },
    );
    expect(result.accepted).toBe(true);
    expect(result.gate.valid).toBe(true);
    const finalZ = result.qpos[r.ballZ.qposAdr]!;
    expect(finalZ).toBeGreaterThanOrEqual(r.ballHeightM.min - 0.02);
    expect(checkPhaseBounds(r, result.qpos)).toEqual([]);
  });

  it('the tether binds: a past-tether ball drag settles at the tether length', () => {
    const stance = pose('stance-clean');
    const { limits, resolved: r } = limitsFor('stance');
    const ballStart = bodyPos(stance.qpos, 'ball');
    const result = gate.project(
      stance.qpos,
      {
        frameType: 'geom',
        frameId: geomIdOf('ball'),
        position: [ballStart[0] + 0.4, ballStart[1], ballStart[2]],
      },
      { extraLimits: limits },
    );
    expect(result.accepted).toBe(true);
    expect(result.gate.valid).toBe(true);
    const ball = bodyPos(result.qpos, 'ball');
    const hand = bodyPos(result.qpos, SHOOTING_HAND_BODY);
    const dist = Math.hypot(ball[0] - hand[0], ball[1] - hand[1], ball[2] - hand[2]);
    expect(dist).toBeLessThanOrEqual(r.ballHandMaxM + 0.005);
    expect(dist, 'drag too weak: tether never engaged').toBeGreaterThan(r.ballHandMaxM - 0.01);
  });

  it('an absurd ball drag ends tethered or reverted — never an untethered commit', () => {
    // The projection's COM limit tracks the humanoid-only COM while the
    // authority includes the ball (a documented ~1.5%-mass approximation), so a
    // sustained extreme pull may lean the body until the authority says no.
    // Either outcome is in-contract; an accepted untethered pose is not.
    const stance = pose('stance-clean');
    const { limits, resolved: r } = limitsFor('stance');
    const ballStart = bodyPos(stance.qpos, 'ball');
    const result = gate.project(
      stance.qpos,
      {
        frameType: 'geom',
        frameId: geomIdOf('ball'),
        position: [ballStart[0] + 1.2, ballStart[1] - 0.5, ballStart[2]],
      },
      { extraLimits: limits },
    );
    if (result.accepted) {
      expect(result.gate.valid).toBe(true);
      const ball = bodyPos(result.qpos, 'ball');
      const hand = bodyPos(result.qpos, SHOOTING_HAND_BODY);
      const dist = Math.hypot(ball[0] - hand[0], ball[1] - hand[1], ball[2] - hand[2]);
      expect(dist).toBeLessThanOrEqual(r.ballHandMaxM + 0.005);
    } else {
      // Reject-and-revert: the caller gets its input back, byte for byte.
      expect(Array.from(result.qpos)).toEqual(Array.from(Float64Array.from(stance.qpos)));
    }
  });

  it('dragging the arm tows the tethered ball along (coupling works both ways)', () => {
    const stance = pose('stance-clean');
    const { limits, resolved: r } = limitsFor('stance');
    const handStart = bodyPos(stance.qpos, SHOOTING_HAND_BODY);
    // A long sideways hand sweep; unconstrained, the ball would stay parked.
    const result = gate.project(
      stance.qpos,
      {
        frameType: 'geom',
        frameId: geomIdOf('hand_right'),
        position: [handStart[0], handStart[1] + 0.45, handStart[2] + 0.1],
      },
      { extraLimits: limits },
    );
    expect(result.accepted).toBe(true);
    const ball = bodyPos(result.qpos, 'ball');
    const hand = bodyPos(result.qpos, SHOOTING_HAND_BODY);
    const dist = Math.hypot(ball[0] - hand[0], ball[1] - hand[1], ball[2] - hand[2]);
    expect(dist).toBeLessThanOrEqual(r.ballHandMaxM + 0.02);
  });

  it('projection under the editor limits is deterministic', () => {
    const dip = pose('dip-clean');
    const { limits } = limitsFor('dip');
    const start = bodyPos(dip.qpos, SHOOTING_HAND_BODY);
    const drag = {
      frameType: 'geom' as const,
      frameId: geomIdOf('hand_right'),
      position: [start[0] + 0.1, start[1] - 0.05, start[2] + 0.2],
    };
    const a = gate.project(dip.qpos, drag, { extraLimits: limits });
    const b = gate.project(dip.qpos, drag, { extraLimits: limits });
    expect(Array.from(a.qpos)).toEqual(Array.from(b.qpos));
    expect(a.steps).toBe(b.steps);
  });

  it('EVERY shipped library pose (clean + faulted) survives a small hand nudge under the editor limit set', () => {
    // The product invariant behind the whole editor: every shipped pose is
    // editable. This is the regression net that caught the guide-hand↔ball
    // collision (see EDITOR_COLLISION_PAIRS): without the collision rows the
    // projection converges into authority-rejected penetration on the
    // follow-through-arm-collapsed poses and they become uneditable.
    const provider: BoundsProvider = createBoundsProvider(engine);
    try {
      for (const libraryPose of POSE_LIBRARY.poses) {
        const machinery = provider.get(libraryPose.phase as never);
        const start = bodyPos(libraryPose.qpos, SHOOTING_HAND_BODY);
        const result = gate.project(
          libraryPose.qpos,
          {
            frameType: 'geom',
            frameId: geomIdOf('hand_right'),
            position: [start[0] + 0.03, start[1], start[2] + 0.03],
          },
          { extraLimits: machinery.limits },
        );
        expect(result.accepted, `${libraryPose.id}: nudge rejected`).toBe(true);
        expect(result.gate.valid, `${libraryPose.id}: invalid result`).toBe(true);
        expect(
          checkPhaseBounds(machinery.resolved, result.qpos),
          `${libraryPose.id}: left its phase envelope`,
        ).toEqual([]);
      }
    } finally {
      provider.dispose();
    }
  });

  it('the collision rows are load-bearing: without them the collapsed-arm drag converges into penetration', () => {
    const collapsed = pose('follow-through-arm-collapsed-early-00');
    const { limits } = limitsFor('follow-through'); // phase + tether rows only — no collision pairs
    const start = bodyPos(collapsed.qpos, SHOOTING_HAND_BODY);
    const drag = {
      frameType: 'geom' as const,
      frameId: geomIdOf('hand_right'),
      position: [start[0] + 0.03, start[1], start[2] + 0.03],
    };
    const without = gate.project(collapsed.qpos, drag, { extraLimits: limits });
    expect(without.accepted, 'fixture drift: the bare drag no longer reproduces the failure').toBe(
      false,
    );
    const withRows = gate.project(collapsed.qpos, drag, {
      extraLimits: [...limits, new CollisionAvoidanceLimit(configuration, EDITOR_COLLISION_PAIRS)],
    });
    expect(withRows.accepted).toBe(true);
    expect(withRows.gate.valid).toBe(true);
  });
});
