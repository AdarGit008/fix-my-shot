"""Offline MJX pose-library generator (issue #8).

Seeds the humanoid, poses each phase in-range, injects controlled out-of-range faults,
keeps only gate-valid configurations, and writes a versioned static pose library the app
consumes. Deterministic: a fixed seed reproduces the library byte-for-byte; each pose
records its seed and the exact fault magnitudes applied.

Usage:
    python tools/posegen/generate.py [--seed N] [--out PATH]
    python tools/posegen/generate.py --verify [--out PATH]   # re-gate the shipped library
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import numpy as np  # noqa: E402

from gate import evaluate  # noqa: E402
from library import BASELINES, FAULTS, PHASE_ORDER, VARIANTS_PER_FAULT  # noqa: E402
from model import Humanoid  # noqa: E402

DEFAULT_SEED = 20260723
DEFAULT_OUT = _HERE.parents[1] / "apps" / "web" / "src" / "poses" / "library.json"
LIBRARY_VERSION = 1
JITTER = 0.2  # ±20% seed-driven magnitude jitter per fault variant


def _pose_record(h: Humanoid, pose_id: str, phase: str, kind: str, seed: int, faults: list[dict]) -> dict:
    gate = evaluate(h)
    return {
        "id": pose_id,
        "phase": phase,
        "kind": kind,
        "seed": seed,
        "faults": faults,
        "jointAnglesDeg": h.joint_angles_deg(),
        "root": h.root_pose(),
        "ball": h.ball_pose(),
        "qpos": h.qpos(),
        "gate": gate.as_dict(),
        "valid": gate.valid,
    }


def _build_clean(h: Humanoid, phase: str) -> tuple[dict, dict[str, float]]:
    """Pose the in-range baseline, balance it, park the ball; return record + balanced angles."""
    h.reset()
    h.set_angles({j: float(v) for j, v in BASELINES[phase]["angles"].items()})
    h.ground()
    h.balance()
    balanced = h.joint_angles_deg()
    h.place_ball(BASELINES[phase]["ball_offset"])
    record = _pose_record(h, f"{phase}-clean", phase, "clean", DEFAULT_SEED, [])
    return record, balanced


def _build_fault(h: Humanoid, phase: str, balanced: dict[str, float], pose_id: str, seed: int, applied: dict[str, float], principle: str) -> dict:
    """Apply the fault deltas to the balanced clean pose (clamped to limits), then re-balance
    over the ankles — a joint no fault touches, so it recenters the COM without erasing the
    form conflict (a bad-form pose is still physically upright)."""
    h.reset()
    h.set_angles(balanced)
    faults = []
    for joint, delta in applied.items():
        lo, hi = h.joint_limit_deg(joint)
        target = min(hi, max(lo, balanced.get(joint, 0.0) + delta))
        h.set_angle(joint, target)
        faults.append(
            {"joint": joint, "principle": principle, "deltaDeg": round(target - balanced.get(joint, 0.0), 3)}
        )
    h.ground()
    h.rebalance(exclude=tuple(applied.keys()))
    h.place_ball(BASELINES[phase]["ball_offset"])
    return _pose_record(h, pose_id, phase, "faulted", seed, faults)


def generate(seed: int) -> dict:
    h = Humanoid()
    rng = np.random.default_rng(seed)
    poses: list[dict] = []
    rejected: list[str] = []

    for phase in PHASE_ORDER:
        clean, balanced = _build_clean(h, phase)
        if not clean["valid"]:
            raise RuntimeError(f"clean baseline for phase '{phase}' failed the gate: {clean['gate']}")
        poses.append(clean)

        for fault in FAULTS[phase]:
            for variant in range(VARIANTS_PER_FAULT):
                scale = 1.0 + float(rng.uniform(-JITTER, JITTER))
                applied = {joint: delta * scale for joint, delta in fault.deltas.items()}
                pose_id = f"{phase}-{fault.id}-{variant:02d}"
                record = _build_fault(h, phase, balanced, pose_id, seed, applied, fault.principle)
                if record["valid"]:
                    poses.append(record)
                else:
                    rejected.append(f"{pose_id} ({record['gate']})")

    if rejected:
        print(f"note: {len(rejected)} fault variant(s) rejected as gate-invalid:", file=sys.stderr)
        for r in rejected:
            print(f"  - {r}", file=sys.stderr)

    return {
        "version": LIBRARY_VERSION,
        "generator": "tools/posegen/generate.py",
        "model": "humanoid+ball (apps/web/src/spike/scene.xml)",
        "seed": seed,
        "jointOrder": h.hinges,
        "phases": PHASE_ORDER,
        "poseCount": len(poses),
        "poses": poses,
    }


def verify(out: Path) -> int:
    """Re-gate every pose in the shipped library from its stored qpos (independent check)."""
    library = json.loads(out.read_text())
    h = Humanoid()
    bad: list[str] = []
    for pose in library["poses"]:
        h.data.qpos[:] = np.array(pose["qpos"], dtype=float)
        gate = evaluate(h)
        if not gate.valid:
            bad.append(f"{pose['id']}: {gate.as_dict()}")
    phases = {p["phase"] for p in library["poses"]}
    print(f"verified {len(library['poses'])} poses across {len(phases)} phases; {len(bad)} invalid")
    for b in bad:
        print(f"  INVALID {b}", file=sys.stderr)
    return 1 if bad or phases != set(PHASE_ORDER) else 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Offline MJX pose-library generator (issue #8)")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--verify", action="store_true", help="re-gate the shipped library instead of regenerating")
    args = parser.parse_args()

    if args.verify:
        raise SystemExit(verify(args.out))

    library = generate(args.seed)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(library, indent=2) + "\n")
    print(f"wrote {library['poseCount']} poses to {args.out}")


if __name__ == "__main__":
    main()
