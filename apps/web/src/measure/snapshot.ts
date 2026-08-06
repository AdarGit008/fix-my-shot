// Engine adapter for the measurement layer (issue #11): reads a PoseSnapshot
// off the MuJoCo state at a given qpos — landmark positions from body frames,
// the torso forward axis, world COM (incl. the ball, matching the gate's
// authority), the foot-support polygon (the gate's own construction), contact
// flags from foot-capsule endpoint heights, and the stature normalizer from
// the model's default standing pose. The snapshot is plain data: recipes in
// @fix-my-shot/basketball read it with no engine access.

import type { PoseSnapshot } from '@fix-my-shot/core';
import { FREE_THROW_TARGET, PHASES, type PhaseId } from '@fix-my-shot/basketball';
import type { GateEngine } from '../gate';
import { convexHull, footprint } from '../gate';

/** Landmark name → model body name (the adapter half of the recipe contract). */
const LANDMARK_BODIES: Readonly<Record<string, string>> = {
  torso: 'torso',
  head: 'head',
  pelvis: 'pelvis',
  hip_right: 'thigh_right',
  knee_right: 'shin_right',
  ankle_right: 'foot_right',
  shoulder_right: 'upper_arm_right',
  elbow_right: 'lower_arm_right',
  hand_right: 'hand_right',
  hip_left: 'thigh_left',
  knee_left: 'shin_left',
  ankle_left: 'foot_left',
  shoulder_left: 'upper_arm_left',
  elbow_left: 'lower_arm_left',
  hand_left: 'hand_left',
};

const HEAD_GEOM_R = 0.09; // scene.xml head sphere — stature = standing head-top height
const FOOT_GEOMS_RIGHT = ['foot1_right', 'foot2_right'] as const;
const FOOT_GEOMS_LEFT = ['foot1_left', 'foot2_left'] as const;
/** ENGINEERING contact thresholds, calibrated against the shipped library's
 * endpoint heights (capsule r 0.027, generator grounds to ~1 mm penetration):
 * a sole "touches" when its lowest endpoint is near the floor; "heels down"
 * tolerates the small heel rise the balance pass's ankle tuning produces
 * (library max 0.056 m) while a real tip-toe heel rises well past 0.08 m. */
const SOLE_TOUCH_M = 0.035;
const HEEL_DOWN_M = 0.065;

interface Resolved {
  bodies: Record<string, number>;
  ballQposAdr: number;
  torsoBodyId: number;
  footGeomsRight: number[];
  footGeomsLeft: number[];
  stature: number;
}

const cache = new WeakMap<GateEngine, Resolved>();

function resolve(engine: GateEngine): Resolved {
  let resolved = cache.get(engine);
  if (resolved) return resolved;
  const { mj, model, data } = engine;
  const bodyId = (name: string): number => {
    const id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY.value as number, name);
    if (id < 0) throw new Error(`snapshot: body '${name}' missing from model`);
    return id;
  };
  const geomId = (name: string): number => {
    const id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_GEOM.value as number, name);
    if (id < 0) throw new Error(`snapshot: geom '${name}' missing from model`);
    return id;
  };
  const jointId = (name: string): number => {
    const id = mj.mj_name2id(model, mj.mjtObj.mjOBJ_JOINT.value as number, name);
    if (id < 0) throw new Error(`snapshot: joint '${name}' missing from model`);
    return id;
  };

  const bodies: Record<string, number> = {};
  for (const [landmark, body] of Object.entries(LANDMARK_BODIES)) {
    bodies[landmark] = bodyId(body);
  }

  // Stature once per engine: forward the model's default standing pose and
  // read the head top, then restore whatever state was resident.
  const saved = Float64Array.from(data.qpos as ArrayLike<number>);
  (data.qpos as Float64Array).set(model.qpos0 as ArrayLike<number>);
  mj.mj_forward(model, data);
  const headId = bodies['head']!;
  const stature = (data.xpos as ArrayLike<number>)[3 * headId + 2]! + HEAD_GEOM_R;
  (data.qpos as Float64Array).set(saved);
  mj.mj_forward(model, data);

  resolved = {
    bodies,
    ballQposAdr: Array.from(model.jnt_qposadr as ArrayLike<number>)[jointId('ball_free')]!,
    torsoBodyId: bodies['torso']!,
    footGeomsRight: FOOT_GEOMS_RIGHT.map(geomId),
    footGeomsLeft: FOOT_GEOMS_LEFT.map(geomId),
    stature,
  };
  cache.set(engine, resolved);
  return resolved;
}

/** Foot-capsule endpoint heights: [heelZ, toeZ] per geom (heel = −z end of the
 * capsule's local axis, which points toe-ward in this model). */
function capsuleEndZs(engine: GateEngine, geom: number): [number, number] {
  const xpos = engine.data.geom_xpos as ArrayLike<number>;
  const xmat = engine.data.geom_xmat as ArrayLike<number>;
  const size = engine.model.geom_size as ArrayLike<number>;
  const half = size[geom * 3 + 1] as number;
  const cz = xpos[geom * 3 + 2] as number;
  const zz = xmat[geom * 9 + 8] as number; // world-z component of the local z axis
  return [cz - half * zz, cz + half * zz];
}

/**
 * Read the world snapshot of `qpos` labelled with `phase`. Forwards the engine
 * at qpos, copies everything into plain data, and restores the resident state
 * (same discipline as the gate's evaluateQpos — safe to interleave).
 */
export function snapshotQpos(
  engine: GateEngine,
  phase: PhaseId,
  qpos: ArrayLike<number>,
): PoseSnapshot {
  if (!PHASES.some((p) => p.id === phase)) {
    throw new Error(`snapshot: unknown phase '${phase}'`);
  }
  const resolved = resolve(engine);
  const { mj, model, data } = engine;
  const q = data.qpos as Float64Array;
  if (qpos.length !== q.length) {
    throw new Error(`snapshot: qpos has length ${qpos.length}, model expects nq=${q.length}`);
  }
  const saved = Float64Array.from(q);
  q.set(qpos as ArrayLike<number>);
  mj.mj_forward(model, data);

  const xpos = data.xpos as ArrayLike<number>;
  const keypoints: Record<string, readonly [number, number, number]> = {};
  for (const [landmark, id] of Object.entries(resolved.bodies)) {
    keypoints[landmark] = [xpos[3 * id]!, xpos[3 * id + 1]!, xpos[3 * id + 2]!];
  }

  // Torso forward axis: the frame's local +x column of the row-major world
  // rotation (the humanoid faces +x in its default pose).
  const xmat = data.xmat as ArrayLike<number>;
  const t = resolved.torsoBodyId;
  const torsoForward: readonly [number, number, number] = [
    xmat[9 * t]!,
    xmat[9 * t + 3]!,
    xmat[9 * t + 6]!,
  ];

  const com = data.subtree_com as ArrayLike<number>; // row 0: world COM incl. ball (gate parity)
  const support = convexHull(footprint(engine)).map(
    (p) => [p[0], p[1]] as readonly [number, number],
  );

  const grounded = (geoms: readonly number[]): boolean =>
    geoms.some((g) => {
      const [heel, toe] = capsuleEndZs(engine, g);
      return Math.min(heel, toe) <= SOLE_TOUCH_M;
    });
  const heelsDown = [...resolved.footGeomsRight, ...resolved.footGeomsLeft].every(
    (g) => capsuleEndZs(engine, g)[0] <= HEEL_DOWN_M,
  );

  const a = resolved.ballQposAdr;
  const ball = {
    id: 'ball',
    position: [q[a]!, q[a + 1]!, q[a + 2]!] as const,
    orientation: [q[a + 4]!, q[a + 5]!, q[a + 6]!, q[a + 3]!] as const, // wxyz → xyzw
  };

  const azimuthRad = (FREE_THROW_TARGET.azimuthDeg * Math.PI) / 180;
  const snapshot: PoseSnapshot = {
    phase,
    keypoints,
    directions: { torso_forward: torsoForward },
    com: [com[0]!, com[1]!, com[2]!],
    supportPolygon: support,
    contacts: {
      sole_right: grounded(resolved.footGeomsRight),
      sole_left: grounded(resolved.footGeomsLeft),
      heels_down: heelsDown,
    },
    implement: ball,
    stature: resolved.stature,
    targetDirection: [Math.cos(azimuthRad), Math.sin(azimuthRad), 0],
  };

  // Restore the resident state for whoever owns this engine's data.
  q.set(saved);
  mj.mj_forward(model, data);
  return snapshot;
}
