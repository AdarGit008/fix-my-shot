/* Differential-IK assembly and solve for the physical-validity gate (issue #9).
 *
 * Ported from kevinzakka/mink, src/mink/solve_ik.py, pinned commit
 * 44c8a6ab66d27d06249f9018334a51662605e3e4.
 *
 * ── Upstream licence ──────────────────────────────────────────────────
 * Copyright 2024 Kevin Zakka
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *
 * Changes from upstream (Python/numpy/qpsolvers → TypeScript + gate/qp.ts):
 * - The QP backend is our own dense Goldfarb–Idnani solver (qp.ts), not
 *   qpsolvers; failures return { found: false } instead of raising
 *   NoSolutionFound (the gate rejects instead of throwing).
 * - Objective assembly: each task accumulates H += WJᵀWJ + μ·I and
 *   c += −WeᵀWJ via Task.assembleInto (tasks.ts); buildIk then adds ONLY the
 *   global `damping` to the diagonal. Upstream's fused path computes
 *   H = WᵀW then H.flat[::nv+1] += damping + Σμ — algebraically identical,
 *   with each per-task LM term μ counted exactly once (never twice).
 * - The QP variable is the displacement x = Δq (G·Δq ≤ h); the returned
 *   velocity is v = x/dt, exactly as upstream (delta_q / dt).
 * - No default ConfigurationLimit when `limits` is omitted here — the gate
 *   always passes its limit set explicitly; an empty list means unconstrained.
 * - Dropped: equality constraints (A, b), safety_break/check_limits gating,
 *   solver selection kwargs.
 */

import type { GateConfiguration } from './configuration';
import type { Limit } from './limits';
import { solveQp } from './qp';
import type { Task } from './tasks';

/** Dense QP of the IK step: min ½ΔqᵀHΔq + cᵀΔq s.t. G·Δq ≤ h. */
export interface IkProblem {
  H: Float64Array; // nv×nv row-major
  c: Float64Array; // nv
  G: Float64Array | null; // m×nv row-major (null when no active limits)
  h: Float64Array | null; // m
  m: number;
}

export interface IkResult {
  /** Tangent-space velocity v = Δq/dt (zeros when found is false). */
  v: Float64Array;
  /** False when the QP could not be solved (e.g. infeasible limits). */
  found: boolean;
}

/**
 * Assemble the IK QP from tasks and limits at the current configuration.
 * `damping` is the global Levenberg-Marquardt term added to every diagonal
 * entry (all dofs, including the floating base) — per-task μ terms are
 * already inside each task's assembleInto contribution.
 */
export function buildIk(
  configuration: GateConfiguration,
  tasks: readonly Task[],
  dt: number,
  damping = 1e-12,
  limits: readonly Limit[] = [],
): IkProblem {
  const nv = configuration.nv;
  const H = new Float64Array(nv * nv);
  const c = new Float64Array(nv);
  for (const task of tasks) task.assembleInto(H, c, configuration);
  for (let i = 0; i < nv; i++) H[i * nv + i] = H[i * nv + i]! + damping;

  const active: { G: Float64Array; h: Float64Array; count: number }[] = [];
  let m = 0;
  for (const limit of limits) {
    const ineq = limit.computeQpInequalities(configuration, dt);
    if (ineq === null) continue;
    active.push(ineq);
    m += ineq.count;
  }
  if (m === 0) return { H, c, G: null, h: null, m: 0 };
  const G = new Float64Array(m * nv);
  const h = new Float64Array(m);
  let row = 0;
  for (const ineq of active) {
    G.set(ineq.G.subarray(0, ineq.count * nv), row * nv);
    h.set(ineq.h.subarray(0, ineq.count), row);
    row += ineq.count;
  }
  return { H, c, G, h, m };
}

/**
 * Solve the differential IK problem: the QP solves for Δq, and the returned
 * velocity is v = Δq/dt. With no tasks the objective is pure damping and
 * v = 0 (upstream test_trivial_solution). found=false propagates from the QP
 * (infeasible/failed) with v = 0; callers must reject the step.
 */
export function solveIk(
  configuration: GateConfiguration,
  tasks: readonly Task[],
  dt: number,
  damping = 1e-12,
  limits: readonly Limit[] = [],
): IkResult {
  const nv = configuration.nv;
  const { H, c, G, h, m } = buildIk(configuration, tasks, dt, damping, limits);
  const result = solveQp(H, c, G, h, nv, m);
  if (!result.found) return { v: new Float64Array(nv), found: false };
  const v = new Float64Array(nv);
  for (let i = 0; i < nv; i++) v[i] = result.x[i]! / dt;
  return { v, found: true };
}

/**
 * One projection step: solveIk, then integrate the velocity into the
 * configuration in place (only when the QP succeeded). Returns the IK result
 * so callers can observe found=false and reject.
 */
export function projectStep(
  configuration: GateConfiguration,
  tasks: readonly Task[],
  dt: number,
  damping = 1e-12,
  limits: readonly Limit[] = [],
): IkResult {
  const result = solveIk(configuration, tasks, dt, damping, limits);
  if (result.found) configuration.integrateInplace(result.v, dt);
  return result;
}
