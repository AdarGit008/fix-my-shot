"""Physical-validity gate (stub — the shipped gate is issue #9, a TS port of mink's QP).

A pose passes iff (ADR-0009): (a) every joint is within its limits, (b) the COM projects
inside the foot-support polygon, and (c) contact penetration is below tolerance. This
Python stub validates the generated library at build time; the real interactive gate is
#9. Both must agree on the same three checks, so #8's output final-passes #9's gate.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from model import Humanoid, cross2

MAX_PENETRATION_M = 5e-3  # contact penetration tolerance ε
LIMIT_TOL_DEG = 0.5  # joint-limit slack (grounding/rounding noise)


@dataclass
class GateResult:
    joint_limits: bool
    com_in_support: bool
    max_penetration_m: float
    valid: bool

    def as_dict(self) -> dict[str, object]:
        return {
            "jointLimits": self.joint_limits,
            "comInSupport": self.com_in_support,
            "maxPenetrationM": round(self.max_penetration_m, 5),
            "valid": self.valid,
        }


def _convex_hull(points: np.ndarray) -> np.ndarray:
    """Andrew's monotone-chain hull (CCW), for the support polygon."""
    pts = points[np.lexsort((points[:, 1], points[:, 0]))]

    def half(seq: np.ndarray) -> list[np.ndarray]:
        out: list[np.ndarray] = []
        for p in seq:
            while len(out) >= 2 and cross2(out[-1] - out[-2], p - out[-2]) <= 1e-12:
                out.pop()
            out.append(p)
        return out

    return np.array(half(pts)[:-1] + half(pts[::-1])[:-1])


def _point_in_hull(point: np.ndarray, hull: np.ndarray) -> bool:
    n = len(hull)
    if n < 3:
        return False
    signs = [cross2(hull[(i + 1) % n] - hull[i], point - hull[i]) for i in range(n)]
    return all(s >= -1e-6 for s in signs) or all(s <= 1e-6 for s in signs)


def _max_penetration(h: Humanoid) -> float:
    h.forward()
    pen = 0.0
    for i in range(h.data.ncon):
        pen = max(pen, -float(h.data.contact[i].dist))
    return pen


def _joint_limits_ok(h: Humanoid) -> bool:
    for joint in h.hinges:
        lo, hi = h.joint_limit_deg(joint)
        value = h.get_angle(joint)
        if value < lo - LIMIT_TOL_DEG or value > hi + LIMIT_TOL_DEG:
            return False
    return True


def evaluate(h: Humanoid) -> GateResult:
    """Run the three-part gate on the humanoid's current configuration."""
    h.forward()
    limits = _joint_limits_ok(h)
    penetration = _max_penetration(h)
    com_ok = _point_in_hull(h.com_xy(), _convex_hull(h.footprint()))
    valid = limits and com_ok and penetration <= MAX_PENETRATION_M
    return GateResult(limits, com_ok, penetration, valid)
