"""The pose recipes: one in-range baseline per phase + per-phase fault templates.

Baselines are joint-angle targets (degrees, MuJoCo joint convention) for a plausible
in-range pose of each phase; faults perturb one or two joints out of the form band by a
controlled magnitude, each tagged with the principle id it conflicts with (the ids come
from @fix-my-shot/basketball's BASELINE, issue #7). Angles a baseline omits keep the
model's default (0°). Faults that only involve wrist/hand geometry are intentionally
absent — this humanoid has no wrist DOF (see model.py).
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Phase id (matches @fix-my-shot/core Phase.id) -> baseline joint angles + ball offset.
PHASE_ORDER = ["stance", "dip", "loading", "set-release", "follow-through"]

BASELINES: dict[str, dict[str, object]] = {
    "stance": {
        "angles": {
            "knee_right": -18,
            "knee_left": -18,
            "hip_y_right": -14,
            "hip_y_left": -14,
            "shoulder1_right": -70,
            "shoulder2_right": -40,
            "elbow_right": -30,
        },
        "ball_offset": (0.18, 0.0, 0.03),
    },
    "dip": {
        "angles": {
            "knee_right": -55,
            "knee_left": -55,
            "hip_y_right": -45,
            "hip_y_left": -45,
            "shoulder1_right": -60,
            "shoulder2_right": -50,
            "elbow_right": 20,
        },
        "ball_offset": (0.18, 0.0, -0.03),
    },
    "loading": {
        "angles": {
            "knee_right": -30,
            "knee_left": -30,
            "hip_y_right": -22,
            "hip_y_left": -22,
            "shoulder1_right": -75,
            "shoulder2_right": 30,
            "elbow_right": -80,
        },
        "ball_offset": (0.18, 0.0, 0.07),
    },
    "set-release": {
        "angles": {
            "knee_right": -8,
            "knee_left": -8,
            "shoulder1_right": -85,
            "shoulder2_right": 60,
            "elbow_right": -90,
        },
        "ball_offset": (0.18, 0.0, 0.10),
    },
    "follow-through": {
        "angles": {
            "knee_right": -4,
            "knee_left": -4,
            "shoulder1_right": -85,
            "shoulder2_right": 60,
            "elbow_right": -40,
        },
        "ball_offset": (0.18, 0.0, 0.12),
    },
}


@dataclass
class Fault:
    """A form conflict: joint deltas (deg) off the baseline + the principle it breaks."""

    id: str
    principle: str
    deltas: dict[str, float] = field(default_factory=dict)


FAULTS: dict[str, list[Fault]] = {
    "stance": [
        Fault("hunched-torso", "erect-torso", {"abdomen_y": -24}),
        Fault("leaning-back", "trunk-inclination", {"abdomen_y": 18}),
        Fault("wide-stance", "stance-width", {"hip_x_right": -20, "hip_x_left": -20}),
    ],
    "dip": [
        Fault("unloaded-straight-knee", "load-presence", {"knee_right": 36, "knee_left": 36}),
        Fault("asymmetric-load", "load-presence", {"knee_right": 30}),
        Fault("shallow-knee", "knee-flexion", {"knee_right": 22, "knee_left": 22}),
    ],
    "loading": [
        Fault("elbow-flared-out", "elbow-under-loading", {"shoulder2_right": -55}),
        Fault("legs-not-extending", "sequential-leg-extension", {"knee_right": -20, "knee_left": -20}),
        Fault("low-arm-drive", "shoulder-elevation", {"shoulder1_right": 40}),
    ],
    "set-release": [
        Fault("elbow-not-extended", "near-full-elbow-extension", {"elbow_right": 55}),
        Fault("trunk-lean-at-release", "trunk-at-release", {"abdomen_y": -22}),
        Fault("knee-bent-at-release", "base-extended", {"knee_right": -26, "knee_left": -26}),
    ],
    "follow-through": [
        Fault("arm-collapsed-early", "terminal-wrist-flexion", {"elbow_right": 55}),
        Fault("dropped-shooting-arm", "terminal-wrist-flexion", {"shoulder1_right": 45}),
        Fault("forward-collapse", "head-stabilized", {"abdomen_y": -20}),
    ],
}

# Per fault template, how many seed-jittered magnitude variants to emit.
VARIANTS_PER_FAULT = 2
