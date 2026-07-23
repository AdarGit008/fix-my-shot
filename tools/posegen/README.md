# tools/posegen — offline pose pipeline (Python)

The **offline** half of the system (ADR-0003, ADR-0007, ADR-0009): it generates the
phase-labeled, fault-injected, gate-valid pose library the app grades against, and —
later (#12) — the differentiable leverage oracle.

It is intentionally **not** an npm workspace: the repo's `baseline.repo.json` `type` is
`node` (the shipped app), and this Python tool is a build-time generator, not a runtime
dependency. It runs on a workstation/CI job that produces the static pose data checked
into the app, never in the browser.

## What it does (issue #8)

For each of the five shooting-form phases (`@fix-my-shot/basketball`), it poses an
in-range baseline on the DeepMind humanoid (the same `apps/web/src/spike/scene.xml` the
app renders), injects controlled out-of-range **faults** (each tagged with the principle
id it breaks, from #7's `BASELINE`), and keeps only configurations that pass the
**validity gate** — joint limits + COM-in-support + contact-penetration ≤ ε (ADR-0009).
The gate here is a build-time stub; the shipped interactive gate is issue **#9**, and
this library must final-pass it.

The gate uses classic **MuJoCo forward kinematics** (reliable contacts/COM). MJX
(`mujoco-mjx`) is pinned for the differentiable oracle in #12 — same physics, ADR-0003.

Note: the humanoid has no wrist/finger DOF, so faults cover the **body-joint** principles
(balance, knee/hip flexion, elbow extension, trunk lean, stance, symmetry); hand/ball
geometry is carried by the ball position. Wrist/finger detail awaits a richer hand model.

## Modules

- `model.py` — load + pose the humanoid: set joint angles, bisection foot-grounding,
  multi-lever COM rebalance, outward ball placement.
- `gate.py` — the three-part validity gate (stub for #9).
- `library.py` — the five in-range phase baselines + per-phase fault templates.
- `generate.py` — seedable driver; writes the versioned library.

## Run

```bash
python -m venv .venv && . .venv/bin/activate       # Python ≥ 3.11
pip install -r tools/posegen/requirements.txt
npm run posegen                                    # → apps/web/src/poses/library.json
python tools/posegen/generate.py --verify          # re-gate the shipped library
```

Generation is **deterministic**: a fixed `--seed` (default 20260723) reproduces the
library byte-for-byte, and every pose records its seed + the exact fault magnitudes.
The library ships committed at `apps/web/src/poses/library.json`.
