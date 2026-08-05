/* EditorSession lifecycle (issue #10): drag → preview → authoritative verdict,
 * reject-and-revert, undo/reset — unit-tested against a scripted gate (no
 * engine), then smoke-tested end-to-end against the real gate + library.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import sceneXml from '../spike/scene.xml?raw';
import { POSE_LIBRARY, type LibraryPose, type PoseGate } from '../poses';
import {
  GateConfiguration,
  createGate,
  loadGateEngine,
  type Gate,
  type ProjectOptions,
  type ProjectResult,
} from '../gate';
import type { ResolvedPhaseBounds } from './limits';
import { EditorSession, createBoundsProvider, type BoundsProvider } from './session';

const NQ = 35;
const VALID: PoseGate = { jointLimits: true, comInSupport: true, maxPenetrationM: 0, valid: true };
const INVALID: PoseGate = {
  jointLimits: true,
  comInSupport: false,
  maxPenetrationM: 0,
  valid: false,
};

/** A fabricated single-joint envelope: joint at qpos[7] ∈ [-1, 1], ball z at qpos[30] ∈ [1, 2]. */
const RESOLVED: ResolvedPhaseBounds = {
  joints: [{ joint: 'j0', qposAdr: 7, dofAdr: 6, loRad: -1, hiRad: 1 }],
  ballZ: { qposAdr: 30, dofAdr: 29 },
  ballHeightM: { min: 1, max: 2 },
  ballHandMaxM: 0.35,
};

const stubBounds: BoundsProvider = {
  get: () => ({ resolved: RESOLVED, limits: [] }),
  dispose: () => {},
};

function fakePose(qpos: number[]): LibraryPose {
  return {
    id: 'fake-stance',
    phase: 'stance',
    kind: 'clean',
    seed: 0,
    faults: [],
    jointAnglesDeg: {},
    root: { pos: [0, 0, 1.2], quat: [1, 0, 0, 0] },
    ball: { pos: [0.3, -0.2, 1.5], quat: [1, 0, 0, 0] },
    qpos,
    gate: { jointLimits: true, comInSupport: true, maxPenetrationM: 0, valid: true },
    valid: true,
  } as unknown as LibraryPose;
}

function inBoundsQpos(): number[] {
  const q = new Array<number>(NQ).fill(0);
  q[30] = 1.5; // ball z inside the fabricated band
  return q;
}

/** Scripted gate: returns queued ProjectResults, records calls. */
function scriptedGate() {
  const calls: { from: Float64Array; position: number[]; options: ProjectOptions }[] = [];
  const queue: ProjectResult[] = [];
  const gate: Gate = {
    evaluate: () => INVALID, // only consulted for rejected-drag diagnosis
    project: (from, drag, options = {}) => {
      calls.push({
        from: Float64Array.from(from as ArrayLike<number>),
        position: Array.from(drag.position as ArrayLike<number>),
        options,
      });
      const next = queue.shift();
      if (!next) throw new Error('scripted gate: no queued result');
      return next;
    },
    dispose: () => {},
  };
  const accept = (qpos: number[], steps = 3): ProjectResult => ({
    qpos: Float64Array.from(qpos),
    gate: VALID,
    accepted: true,
    steps,
  });
  const reject = (qpos: number[], steps = 0): ProjectResult => ({
    qpos: Float64Array.from(qpos),
    gate: VALID,
    accepted: false,
    steps,
  });
  return { gate, calls, queue, accept, reject };
}

describe('EditorSession (scripted gate)', () => {
  it('loads an in-envelope pose and rejects an out-of-envelope one loudly', () => {
    const { gate } = scriptedGate();
    const session = new EditorSession(gate, stubBounds);
    session.load(fakePose(inBoundsQpos()));
    expect(session.phase).toBe('stance');
    expect(Array.from(session.committedQpos)).toEqual(inBoundsQpos());

    const bad = inBoundsQpos();
    bad[7] = 2; // outside the fabricated joint window
    expect(() => session.load(fakePose(bad))).toThrow(/outside its phase envelope/);
  });

  it('preview advances only on accepted micro-steps and never touches the commit', () => {
    const { gate, calls, queue, accept, reject } = scriptedGate();
    const session = new EditorSession(gate, stubBounds, { previewSteps: 2 });
    session.load(fakePose(inBoundsQpos()));
    session.beginDrag({ frameType: 'geom', frameId: 16 });

    const step1 = inBoundsQpos();
    step1[7] = 0.25;
    queue.push(accept(step1));
    session.previewDrag([0.1, 0.2, 0.3]);
    expect(session.displayQpos[7]).toBeCloseTo(0.25);
    expect(session.committedQpos[7]).toBe(0);
    expect(calls[0]!.options.maxSteps).toBe(2);
    expect(calls[0]!.from[7]).toBe(0); // first preview starts from the anchor

    queue.push(reject(step1)); // infeasible micro-step: preview holds
    session.previewDrag([0.2, 0.2, 0.3]);
    expect(session.displayQpos[7]).toBeCloseTo(0.25);
    expect(calls[1]!.from[7]).toBeCloseTo(0.25); // second preview starts from the first

    session.cancelDrag();
    expect(session.displayQpos[7]).toBe(0);
  });

  it('endDrag projects once from the ANCHOR and commits an accepted in-envelope result', () => {
    const { gate, calls, queue, accept } = scriptedGate();
    const session = new EditorSession(gate, stubBounds, { previewSteps: 1, commitSteps: 50 });
    session.load(fakePose(inBoundsQpos()));
    session.beginDrag({ frameType: 'body', frameId: 3 });

    const mid = inBoundsQpos();
    mid[7] = 0.5;
    queue.push(accept(mid));
    session.previewDrag([0, 0, 1]);

    const final = inBoundsQpos();
    final[7] = 0.75;
    queue.push(accept(final, 12));
    const verdict = session.endDrag([0, 0, 1.1]);

    expect(verdict.accepted).toBe(true);
    expect(verdict.steps).toBe(12);
    expect(verdict.boundViolations).toEqual([]);
    expect(session.committedQpos[7]).toBeCloseTo(0.75);
    expect(session.dragging).toBe(false);
    expect(session.canUndo).toBe(true);
    // The authoritative projection ran from the anchor, not the preview.
    expect(calls[1]!.from[7]).toBe(0);
    expect(calls[1]!.options.maxSteps).toBe(50);

    expect(session.undo()).toBe(true);
    expect(session.committedQpos[7]).toBe(0);
    expect(session.canUndo).toBe(false);
  });

  it('reject-and-revert: a rejected drag leaves the commit untouched and diagnoses the preview', () => {
    const { gate, queue, accept, reject } = scriptedGate();
    const session = new EditorSession(gate, stubBounds);
    session.load(fakePose(inBoundsQpos()));
    session.beginDrag({ frameType: 'geom', frameId: 16 });

    const seen = inBoundsQpos();
    seen[7] = 1.5; // the preview the user was looking at, out of the envelope
    queue.push(accept(seen));
    session.previewDrag([0, 0, 1]);

    queue.push(reject(inBoundsQpos()));
    const verdict = session.endDrag([0, 0, 1]);
    expect(verdict.accepted).toBe(false);
    expect(verdict.gate).toBe(INVALID); // diagnosis comes from evaluate(preview)
    expect(verdict.boundViolations.map((v) => v.parameter)).toEqual(['j0']);
    expect(session.committedQpos[7]).toBe(0);
    expect(session.canUndo).toBe(false);
  });

  it('a projection that escapes the envelope is rejected, not committed', () => {
    const { gate, queue, accept } = scriptedGate();
    const session = new EditorSession(gate, stubBounds);
    session.load(fakePose(inBoundsQpos()));
    session.beginDrag({ frameType: 'geom', frameId: 16 });

    const escaped = inBoundsQpos();
    escaped[7] = 1.2; // accepted by the gate but outside the phase window
    queue.push(accept(escaped));
    const verdict = session.endDrag([0, 0, 1]);
    expect(verdict.accepted).toBe(false);
    expect(verdict.boundViolations.map((v) => v.parameter)).toEqual(['j0']);
    expect(session.committedQpos[7]).toBe(0);
  });

  it('reset returns to the loaded pose and clears history', () => {
    const { gate, queue, accept } = scriptedGate();
    const session = new EditorSession(gate, stubBounds);
    session.load(fakePose(inBoundsQpos()));
    session.beginDrag({ frameType: 'geom', frameId: 16 });
    const moved = inBoundsQpos();
    moved[7] = 0.3;
    queue.push(accept(moved));
    session.endDrag([0, 0, 1]);
    expect(session.committedQpos[7]).toBeCloseTo(0.3);

    session.reset();
    expect(session.committedQpos[7]).toBe(0);
    expect(session.canUndo).toBe(false);
  });

  it('guards its lifecycle', () => {
    const { gate } = scriptedGate();
    const session = new EditorSession(gate, stubBounds);
    expect(() => session.beginDrag({ frameType: 'geom', frameId: 1 })).toThrow(/no pose loaded/);
    session.load(fakePose(inBoundsQpos()));
    expect(() => session.previewDrag([0, 0, 0])).toThrow(/without beginDrag/);
    expect(() => session.endDrag([0, 0, 0])).toThrow(/without beginDrag/);
  });
});

describe('EditorSession (real gate + shipped library)', () => {
  let engine: Awaited<ReturnType<typeof loadGateEngine>>;
  let configuration: GateConfiguration;
  let gate: Gate;
  let bounds: BoundsProvider;

  beforeAll(async () => {
    engine = await loadGateEngine(sceneXml);
    configuration = new GateConfiguration(engine);
    gate = createGate(engine);
    bounds = createBoundsProvider(engine);
  }, 30000);

  afterAll(() => {
    bounds.dispose();
    gate.dispose();
    configuration.dispose();
    engine.dispose();
  });

  it('drags stance-clean: preview, accept, stay in phase, undo byte-for-byte', () => {
    const stance = POSE_LIBRARY.poses.find((p) => p.id === 'stance-clean')!;
    const session = new EditorSession(gate, bounds);
    session.load(stance);

    // Current hand position via FK, then a modest reachable pull.
    const { mj, model, data } = engine;
    (data.qpos as Float64Array).set(Float64Array.from(stance.qpos));
    mj.mj_forward(model, data);
    const handGeom = configuration.geomId('hand_right');
    const xpos = data.geom_xpos as ArrayLike<number>;
    const hand = [xpos[3 * handGeom]!, xpos[3 * handGeom + 1]!, xpos[3 * handGeom + 2]!];
    const target = [hand[0]! + 0.02, hand[1]!, hand[2]! + 0.04];

    session.beginDrag({ frameType: 'geom', frameId: handGeom });
    session.previewDrag([hand[0]! + 0.01, hand[1]!, hand[2]! + 0.02]);
    session.previewDrag(target);
    expect(session.dragging).toBe(true);

    const verdict = session.endDrag(target);
    expect(verdict.accepted).toBe(true);
    expect(verdict.gate.valid).toBe(true);
    expect(verdict.boundViolations).toEqual([]);

    const committed = session.committedQpos;
    expect(gate.evaluate(committed).valid).toBe(true);
    let changed = 0;
    for (let i = 0; i < committed.length; i++) {
      if (Math.abs(committed[i]! - stance.qpos[i]!) > 1e-9) changed++;
    }
    expect(changed).toBeGreaterThan(0);

    expect(session.undo()).toBe(true);
    expect(Array.from(session.committedQpos)).toEqual(Array.from(stance.qpos));
  });
});
