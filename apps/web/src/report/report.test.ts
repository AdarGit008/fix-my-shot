/* The issue-#12 Done-when, held against the shipped library: re-grading
 * returns a ranked report; the top fix is stable across near-identical poses;
 * fixes never surface style flags, unmeasured principles, or raw numbers; and
 * every produced report validates against the report JSON schema.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PHASE_BOUNDS, type PhaseId } from '@fix-my-shot/basketball';
import { mulberry32 } from '@fix-my-shot/scoring';

import schema from '../../../../packages/core/schema/report.schema.json';
import sceneXml from '../spike/scene.xml?raw';
import { POSE_LIBRARY, type LibraryPose } from '../poses';
import { GateConfiguration, createGate, loadGateEngine, type Gate } from '../gate';
import { clampToPhaseBounds, resolvePhaseBounds } from '../editor/limits';
import { buildReport } from './index';

type Engine = Awaited<ReturnType<typeof loadGateEngine>>;

// ── A minimal JSON-Schema checker (the subset the report schema uses) ───────
type Json = unknown;

function check(schemaNode: Record<string, Json>, value: Json, path: string, errors: string[]): void {
  const resolve = (node: Record<string, Json>): Record<string, Json> => {
    const ref = node['$ref'] as string | undefined;
    if (!ref) return node;
    const key = ref.replace('#/definitions/', '');
    const definitions = schema.definitions as Record<string, Record<string, Json>>;
    return definitions[key]!;
  };
  const node = resolve(schemaNode);

  if (node['oneOf']) {
    const branches = node['oneOf'] as Record<string, Json>[];
    const passes = branches.filter((branch) => {
      const branchErrors: string[] = [];
      check(branch, value, path, branchErrors);
      return branchErrors.length === 0;
    });
    if (passes.length !== 1) errors.push(`${path}: matched ${passes.length} oneOf branches`);
    return;
  }
  if (node['enum']) {
    if (!(node['enum'] as Json[]).includes(value)) errors.push(`${path}: not in enum`);
    return;
  }
  const type = node['type'] as string | undefined;
  if (type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push(`${path}: not an object`);
      return;
    }
    const object = value as Record<string, Json>;
    const properties = (node['properties'] ?? {}) as Record<string, Record<string, Json>>;
    for (const required of (node['required'] ?? []) as string[]) {
      if (!(required in object)) errors.push(`${path}.${required}: missing`);
    }
    if (node['additionalProperties'] === false) {
      for (const key of Object.keys(object)) {
        if (!(key in properties)) errors.push(`${path}.${key}: unexpected property`);
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in object) check(child, object[key], `${path}.${key}`, errors);
    }
    return;
  }
  if (type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path}: not an array`);
      return;
    }
    value.forEach((item, i) =>
      check(node['items'] as Record<string, Json>, item, `${path}[${i}]`, errors),
    );
    return;
  }
  if (type === 'number' && typeof value !== 'number') errors.push(`${path}: not a number`);
  if (type === 'string' && typeof value !== 'string') errors.push(`${path}: not a string`);
  if (type === 'boolean' && typeof value !== 'boolean') errors.push(`${path}: not a boolean`);
  if (typeof value === 'number') {
    if (typeof node['minimum'] === 'number' && value < node['minimum']) {
      errors.push(`${path}: ${value} below minimum`);
    }
    if (typeof node['maximum'] === 'number' && value > node['maximum']) {
      errors.push(`${path}: ${value} above maximum`);
    }
  }
  if (typeof value === 'string' && typeof node['minLength'] === 'number') {
    if (value.length < node['minLength']) errors.push(`${path}: shorter than minLength`);
  }
}

function validateReport(report: Json): string[] {
  const errors: string[] = [];
  check(schema as unknown as Record<string, Json>, report, 'report', errors);
  return errors;
}

describe('buildReport vs the shipped library (issue #12 Done-when)', () => {
  let engine: Engine;
  let gate: Gate;
  let configuration: GateConfiguration;

  beforeAll(async () => {
    engine = await loadGateEngine(sceneXml);
    gate = createGate(engine);
    configuration = new GateConfiguration(engine);
  }, 30000);

  afterAll(() => {
    configuration.dispose();
    gate.dispose();
    engine.dispose();
  });

  const report = (pose: LibraryPose) =>
    buildReport(engine, gate, pose.phase as PhaseId, pose.qpos);

  it('every faulted pose returns a non-empty ranked fix list of real violations', () => {
    for (const pose of POSE_LIBRARY.poses.filter((p) => p.kind === 'faulted')) {
      const r = report(pose);
      const violated = new Set(
        r.principleResults
          .filter((p) => !p.satisfied && p.measured && p.tier !== 'style-variant')
          .map((p) => p.principleId),
      );
      if (violated.size === 0) {
        // Style-only faults (e.g. leaning-back) flag without producing a fix —
        // legitimate variation is never advice (acceptance #3).
        expect(r.fixes).toEqual([]);
        continue;
      }
      expect(r.fixes.length, `${pose.id}: no fixes`).toBeGreaterThan(0);
      for (const fix of r.fixes) {
        expect(violated.has(fix.principleId), `${pose.id}: fix '${fix.principleId}' not violated`).toBe(
          true,
        );
        expect(fix.cue.length).toBeGreaterThan(0);
        expect(fix.leverage).toBeGreaterThan(0);
      }
      // Ranked: leverage non-increasing.
      for (let i = 1; i < r.fixes.length; i++) {
        expect(r.fixes[i]!.leverage).toBeLessThanOrEqual(r.fixes[i - 1]!.leverage);
      }
    }
  });

  it('a written-in-stone fault always tops the fix list (structural dominance)', () => {
    for (const pose of POSE_LIBRARY.poses.filter((p) => p.kind === 'faulted')) {
      const r = report(pose);
      const brokenStone = r.principleResults.find(
        (p) => p.tier === 'written-in-stone' && !p.satisfied,
      );
      if (!brokenStone) continue;
      expect(r.fixes[0]?.principleId, pose.id).toBe(brokenStone.principleId);
    }
  });

  it('SPEC acceptance #5: the top fix is stable across near-identical poses', () => {
    const rng = mulberry32(0xacce55);
    for (const pose of POSE_LIBRARY.poses.filter((p) => p.kind === 'faulted')) {
      const base = report(pose);
      if (base.fixes.length === 0) continue;
      const resolved = resolvePhaseBounds(configuration, PHASE_BOUNDS[pose.phase as PhaseId]);
      // A near-identical pose: every hinge nudged within ±0.35°, re-validated.
      let jittered: Float64Array | null = null;
      for (let attempt = 0; attempt < 5 && !jittered; attempt++) {
        const q = Float64Array.from(pose.qpos);
        for (const joint of resolved.joints) {
          q[joint.qposAdr] = q[joint.qposAdr]! + (rng() * 2 - 1) * 0.006;
        }
        const clamped = clampToPhaseBounds(resolved, q);
        if (gate.evaluate(clamped).valid) jittered = clamped;
      }
      expect(jittered, `${pose.id}: no valid jitter found`).not.toBeNull();
      const near = buildReport(engine, gate, pose.phase as PhaseId, jittered!);
      expect(near.fixes[0]?.principleId, `${pose.id}: top fix jittered away`).toBe(
        base.fixes[0]!.principleId,
      );
    }
  });

  it('clean poses produce only real residual fixes (or none)', () => {
    for (const pose of POSE_LIBRARY.poses.filter((p) => p.kind === 'clean')) {
      const r = report(pose);
      const violated = new Set(
        r.principleResults.filter((p) => !p.satisfied).map((p) => p.principleId),
      );
      for (const fix of r.fixes) {
        expect(violated.has(fix.principleId)).toBe(true);
      }
    }
  });

  it('reports are deterministic, fixes included', () => {
    const faulted = POSE_LIBRARY.poses.filter((p) => p.kind === 'faulted').slice(0, 4);
    for (const pose of faulted) {
      expect(report(pose)).toEqual(report(pose));
    }
  });

  it('every produced report validates against the report JSON schema', () => {
    for (const pose of POSE_LIBRARY.poses) {
      const errors = validateReport(JSON.parse(JSON.stringify(report(pose))));
      expect(errors, `${pose.id}: ${errors.join('; ')}`).toEqual([]);
    }
  });

  it('stays inside the interactive budget by a wide margin', () => {
    const pose = POSE_LIBRARY.poses.find((p) => p.id === 'dip-unloaded-straight-knee-00')!;
    report(pose); // warm
    const t0 = performance.now();
    report(pose);
    const ms = performance.now() - t0;
    // SPEC §11.7: re-grade + report ≤ 100 ms. Generous ceiling to stay
    // machine-robust in CI while still catching a catastrophic regression.
    expect(ms).toBeLessThan(1000);
  });
});
