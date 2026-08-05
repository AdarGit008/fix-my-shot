// The full product report (issue #12): grade + leverage-ranked, stability-
// gated, cluster-labelled fixes with external-focus cues. This module wires
// the sport-agnostic leverage engine to the real machinery: editable
// parameters from the ADR-0009 subset, phase-envelope clamping, a grounding
// compensation so probe poses keep honest floor contact, gate validation for
// the stability contexts, and the basketball cue table for display decor.
//
// Feasibility model (documented deviation none — the ADR's "gate-feasible"):
//  - stability CONTEXTS are poses in their own right → full three-check gate;
//  - FD PROBES live in the ε-neighbourhood (±1.5° / ±2 cm) of a gate-valid
//    context → clamped to the phase envelope + re-grounded, with the full
//    authority check elided for the interactive budget (a probe is measured,
//    never committed or shown).

import type { Report } from '@fix-my-shot/core';
import {
  EDITABLE_JOINTS,
  PHASE_BOUNDS,
  fixDecor,
  type PhaseId,
} from '@fix-my-shot/basketball';
import { computeFixes, type EvaluateAt, type ParamSpec } from '@fix-my-shot/scoring';
import { GateConfiguration, type Gate, type GateEngine } from '../gate';
import { clampToPhaseBounds, resolvePhaseBounds, type ResolvedPhaseBounds } from '../editor/limits';
import { gradeQpos } from '../measure';

const JOINT_DELTA_RAD = 1.5 * (Math.PI / 180);
const BALL_DELTA_M = 0.02;
/** The generator grounds poses to ~1 mm floor penetration; probes re-ground
 * to the same depth so contact readings stay honest under leg perturbations. */
const GROUND_TARGET_M = -0.001;
const FOOT_GEOMS = ['foot1_right', 'foot2_right', 'foot1_left', 'foot2_left'] as const;

interface ReportMachinery {
  readonly params: readonly ParamSpec[];
  readonly resolved: ResolvedPhaseBounds;
  readonly jointAdr: ReadonlyMap<string, number>;
  readonly ballAdr: number;
  readonly footGeoms: readonly number[];
  readonly footRadius: readonly number[];
}

const machineryCache = new WeakMap<GateEngine, Map<PhaseId, ReportMachinery>>();

function machineryFor(engine: GateEngine, phase: PhaseId): ReportMachinery {
  let byPhase = machineryCache.get(engine);
  if (!byPhase) {
    byPhase = new Map();
    machineryCache.set(engine, byPhase);
  }
  let machinery = byPhase.get(phase);
  if (machinery) return machinery;

  const configuration = new GateConfiguration(engine);
  try {
    const jointAdr = new Map<string, number>();
    for (const joint of EDITABLE_JOINTS) {
      jointAdr.set(joint, configuration.jntQposadr[configuration.jointId(joint)]!);
    }
    const ballAdr = configuration.jntQposadr[configuration.jointId('ball_free')]!;
    const footGeoms = FOOT_GEOMS.map((name) => configuration.geomId(name));
    const size = engine.model.geom_size as ArrayLike<number>;
    machinery = {
      params: [
        ...EDITABLE_JOINTS.map((id) => ({ id, deltaStep: JOINT_DELTA_RAD })),
        { id: 'ball_x', deltaStep: BALL_DELTA_M },
        { id: 'ball_y', deltaStep: BALL_DELTA_M },
        { id: 'ball_z', deltaStep: BALL_DELTA_M },
      ],
      resolved: resolvePhaseBounds(configuration, PHASE_BOUNDS[phase]),
      jointAdr,
      ballAdr,
      footGeoms,
      footRadius: footGeoms.map((g) => size[g * 3]!),
    };
    byPhase.set(phase, machinery);
    return machinery;
  } finally {
    configuration.dispose();
  }
}

/** Apply a parameter-delta map to a base qpos (joints + ball position). */
function applyDeltas(
  machinery: ReportMachinery,
  base: Float64Array,
  deltas: Readonly<Record<string, number>>,
): Float64Array {
  const q = Float64Array.from(base);
  for (const [param, delta] of Object.entries(deltas)) {
    if (delta === 0) continue;
    if (param === 'ball_x') q[machinery.ballAdr] = q[machinery.ballAdr]! + delta;
    else if (param === 'ball_y') q[machinery.ballAdr + 1] = q[machinery.ballAdr + 1]! + delta;
    else if (param === 'ball_z') q[machinery.ballAdr + 2] = q[machinery.ballAdr + 2]! + delta;
    else {
      const adr = machinery.jointAdr.get(param);
      if (adr === undefined) throw new Error(`unknown editable parameter '${param}'`);
      q[adr] = q[adr]! + delta;
    }
  }
  return q;
}

/** Shift the root height so the lowest foot surface sits at the grounding
 * target — leg perturbations would otherwise float or spear the floor and
 * poison the contact/balance readings. Leaves engine data at the probe state
 * (the follow-up snapshot/evaluate re-sets and restores it). */
function reground(engine: GateEngine, machinery: ReportMachinery, q: Float64Array): Float64Array {
  const { mj, model, data } = engine;
  (data.qpos as Float64Array).set(q);
  mj.mj_kinematics(model, data);
  const xpos = data.geom_xpos as ArrayLike<number>;
  const xmat = data.geom_xmat as ArrayLike<number>;
  const size = engine.model.geom_size as ArrayLike<number>;
  let minSurface = Infinity;
  machinery.footGeoms.forEach((g, i) => {
    const half = size[g * 3 + 1] as number;
    const cz = xpos[g * 3 + 2] as number;
    const zz = xmat[g * 9 + 8] as number;
    const radius = machinery.footRadius[i]!;
    minSurface = Math.min(minSurface, cz - half * zz - radius, cz + half * zz - radius);
  });
  if (!Number.isFinite(minSurface)) return q;
  const dz = GROUND_TARGET_M - minSurface;
  if (Math.abs(dz) < 1e-6) return q;
  const out = Float64Array.from(q);
  out[2] = out[2]! + dz;
  return out;
}

/**
 * Build the full report for a phase-labelled qpos: ADR-0008 grade + the
 * leverage-ranked fix list (empty when nothing is violated). Deterministic.
 * The input pose must already be gate-valid (SPEC acceptance #2 — the editor
 * only ever hands over accepted poses).
 */
export function buildReport(
  engine: GateEngine,
  gate: Gate,
  phase: PhaseId,
  qpos: ArrayLike<number>,
): Report {
  const machinery = machineryFor(engine, phase);
  const base = Float64Array.from(qpos as ArrayLike<number>);
  const baseReport = gradeQpos(engine, phase, base);

  const probe: EvaluateAt = (deltas) => {
    const q = reground(
      engine,
      machinery,
      clampToPhaseBounds(machinery.resolved, applyDeltas(machinery, base, deltas)),
    );
    return gradeQpos(engine, phase, q);
  };
  const context: EvaluateAt = (deltas) => {
    const q = reground(
      engine,
      machinery,
      clampToPhaseBounds(machinery.resolved, applyDeltas(machinery, base, deltas)),
    );
    if (!gate.evaluate(q).valid) return null;
    return gradeQpos(engine, phase, q);
  };

  const fixes = computeFixes(baseReport, probe, machinery.params, fixDecor, {
    evaluateContext: context,
  });
  return { ...baseReport, fixes };
}
