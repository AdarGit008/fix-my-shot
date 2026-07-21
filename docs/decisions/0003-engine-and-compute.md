# ADR-0003 — Physics engine & compute architecture

Status: Accepted
Supersedes: none
Superseded-by: none
Date: 2026-07-20

## Context

The physics engine is the heart of the product and realism is the priority — but per ADR-0002 we grade a *pose*, not a simulated shot. "Realism" therefore means a physically honest body+ball+floor state, not a simulated flight. Research established MuJoCo's suitability and confirmed that realistic + real-time + interactive humanoid motion with contact is an unsolved problem best avoided.

## Decision

- **Quasi-static pose grading, NOT full live dynamics.** We evaluate a frozen pose behind a physical-validity gate; we do not simulate continuous motion or hand–ball grip release. No ball trajectory (the "ballistic ball" half of the earlier decision is removed by ADR-0002).
- **Engine role:** (a) represent the body+ball+floor pose realistically; (b) enforce physical validity of edited poses; (c) measure the form quantities the heuristic grades (joint angles, alignment, center-of-mass over base, foot–floor ground reaction, hand/ball contact → backspin mechanics); (d) compute the leverage of a fix on the form score.
- **Floor is in scope:** a fixed ground plane; foot–floor contact and ground reaction (base, balance, leg drive, whole kinetic chain) are graded.
- **Runtime:** MuJoCo via its official WebAssembly build, in-browser, primitive (capsule/link) rendering — realism over aesthetics. Deterministic. *(Refined by ADR-0007: the official first-party bindings now ship as the npm package `@mujoco/mujoco`; `zalo/mujoco_wasm` is vendored reference, not the runtime.)*
- **Offline:** MuJoCo MJX (JAX, differentiable, GPU/TPU) for starting-state generation and for the gradients that **validate** the leverage layer (ADR-0004). MJX is ~10× slower per single scene → offline only, never on the interactive path. *(The interactive leverage signal is in-browser finite differences on the analytic form score; MJX gradients are the offline validation oracle — see ADR-0008, which resolves the apparent "differentiable-yet-offline" tension.)*
- **Contact smoothing:** foot–floor (and hand–ball) contacts use smooth settings (e.g. `solimp[0]=0`) where leverage gradients pass through them, so the leverage signal stays usable.

## Consequences

- Deterministic, trivially real-time interactive loop; the WASM-float-reproducibility risk is largely moot for a static, gate-checked pose.
- **Weakest link:** the pose must be one a real body could hold/produce (realizability) — kept as an open question and a feasibility-gate responsibility.
- Muscle-actuator fidelity remains an optional future dial within the same engine; MJX never runs per-interaction in-browser.
- Not yet benchmarked: in-browser fps/latency for a humanoid+ball+floor scene (inferred feasible from lighter-than-robot load).
