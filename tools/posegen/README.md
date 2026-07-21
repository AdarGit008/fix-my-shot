# tools/posegen — offline MJX pose pipeline (Python / JAX)

This is the **offline** half of the system (ADR-0003, ADR-0007, ADR-0009): it uses
MuJoCo MJX to generate the phase-labeled, fault-injected pose library the app grades
against, and — later — the differentiable leverage oracle.

It is intentionally **not** an npm workspace: the repo's `baseline.repo.json` `type` is
`node` (the shipped app), and this Python tool is a build-time generator, not a runtime
dependency. It runs on a workstation/CI job that produces static pose data checked into
the app, never in the browser.

## Status

Skeleton only. The generator lands with issue **#8** (MJX pose-library generation:
phase-labeled, fault-injected, gate-valid). See [`generate.py`](generate.py) for the
entrypoint stub and [`requirements.txt`](requirements.txt) for the intended deps.
