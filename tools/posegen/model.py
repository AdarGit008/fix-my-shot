"""Humanoid model wrapper: kinematic posing on the shared spike scene (ADR-0009).

Loads the same DeepMind humanoid + ball + floor the app renders
(`apps/web/src/spike/scene.xml`), and provides deterministic, physics-free posing:
set joint angles, drop the feet to the floor by bisection, auto-balance the COM over
the foot base, and park the ball near the shooting hand. No dynamics — every pose is a
static configuration validated by gate.py.

Note: this humanoid has no wrist/finger DOF, so wrist- and hand-geometry principles are
not posable as joint angles; the body-joint principles (balance, knee/hip flexion, elbow
extension, trunk lean, stance, symmetry) are, and hand/ball geometry is carried by the
ball position. Wrist/finger detail is deferred to a richer hand model.
"""

from __future__ import annotations

import math
from pathlib import Path

import mujoco
import numpy as np

SCENE = Path(__file__).resolve().parents[2] / "apps" / "web" / "src" / "spike" / "scene.xml"

# The floor-contacting foot geoms (their capsule footprints define the support base).
FOOT_GEOMS = ("foot1_right", "foot2_right", "foot1_left", "foot2_left")


def cross2(a: np.ndarray, b: np.ndarray) -> float:
    """Scalar 2-D cross product (numpy 2.x dropped 2-D np.cross)."""
    return float(a[0] * b[1] - a[1] * b[0])


class Humanoid:
    """A posable instance of the humanoid+ball scene."""

    def __init__(self) -> None:
        self.model = mujoco.MjModel.from_xml_path(str(SCENE))
        self.data = mujoco.MjData(self.model)
        self.floor_gid = self._gid("floor")
        self.foot_gids = [self._gid(g) for g in FOOT_GEOMS]
        self.hand_gid = self._gid("hand_right")
        self.ball_gid = self._gid("ball")
        self.ball_qadr = self._qadr("ball_free")
        # The ordered list of controllable hinge joints (the pose parameters).
        self.hinges = [
            self._jname(i)
            for i in range(self.model.njnt)
            if self.model.jnt_type[i] == mujoco.mjtJoint.mjJNT_HINGE
        ]

    # -- id helpers ---------------------------------------------------------
    def _gid(self, name: str) -> int:
        return mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_GEOM, name)

    def _jid(self, name: str) -> int:
        return mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_JOINT, name)

    def _jname(self, jid: int) -> str:
        return mujoco.mj_id2name(self.model, mujoco.mjtObj.mjOBJ_JOINT, jid)

    def _qadr(self, name: str) -> int:
        return int(self.model.jnt_qposadr[self._jid(name)])

    # -- posing -------------------------------------------------------------
    def reset(self) -> None:
        self.data.qpos[:] = self.model.qpos0

    def forward(self) -> None:
        mujoco.mj_forward(self.model, self.data)

    def set_angle(self, joint: str, deg: float) -> None:
        self.data.qpos[self._qadr(joint)] = math.radians(deg)

    def set_angles(self, angles: dict[str, float]) -> None:
        for joint, deg in angles.items():
            self.set_angle(joint, deg)

    def get_angle(self, joint: str) -> float:
        return math.degrees(float(self.data.qpos[self._qadr(joint)]))

    def joint_limit_deg(self, joint: str) -> tuple[float, float]:
        lo, hi = self.model.jnt_range[self._jid(joint)]
        return math.degrees(lo), math.degrees(hi)

    def _floor_penetration(self) -> float | None:
        """Max floor-contact penetration depth (m), or None when no foot touches."""
        self.forward()
        pen: float | None = None
        for i in range(self.data.ncon):
            c = self.data.contact[i]
            if c.geom1 == self.floor_gid or c.geom2 == self.floor_gid:
                pen = max(pen if pen is not None else -9.0, -float(c.dist))
        return pen

    def ground(self, target_pen: float = 1e-3) -> None:
        """Bisect the root height so the lowest foot just touches (≈target_pen)."""
        lo = float(self.data.qpos[2]) + 0.4  # feet clear of the floor
        hi = float(self.data.qpos[2]) - 0.4  # feet deep in the floor
        for _ in range(46):
            mid = 0.5 * (lo + hi)
            self.data.qpos[2] = mid
            pen = self._floor_penetration()
            if pen is None or pen < target_pen:
                lo = mid
            else:
                hi = mid
        self.data.qpos[2] = hi
        self.forward()

    def footprint(self) -> np.ndarray:
        """The support base: xy of every foot-capsule endpoint (a stable quad)."""
        self.forward()
        pts = []
        for g in self.foot_gids:
            rot = self.data.geom_xmat[g].reshape(3, 3)
            half = self.model.geom_size[g][1]
            for s in (1.0, -1.0):
                pts.append((self.data.geom_xpos[g] + s * half * rot[:, 2])[:2].copy())
        return np.array(pts)

    def com_xy(self) -> np.ndarray:
        self.forward()
        return self.data.subtree_com[0][:2].copy()

    # Balance levers, most→least COM authority (a lever moves the COM over the base
    # without changing where a form fault lives, as long as the fault isn't on it).
    BALANCE_LEVERS = (("abdomen_y",), ("hip_y_right", "hip_y_left"), ("ankle_y_right", "ankle_y_left"))

    def balance(self, joints: tuple[str, ...] = ("abdomen_y",)) -> None:
        """Tune the given joints together so the COM sits over the foot-base centroid."""
        lo = max(self.joint_limit_deg(j)[0] for j in joints)
        hi = min(self.joint_limit_deg(j)[1] for j in joints)
        best_deg, best_err = lo, math.inf
        for deg in np.arange(lo, hi + 1e-9, 3.0):
            for j in joints:
                self.set_angle(j, float(deg))
            self.ground()
            err = abs(self.com_xy()[0] - self.footprint()[:, 0].mean())
            if err < best_err:
                best_err, best_deg = err, float(deg)
        for j in joints:
            self.set_angle(j, best_deg)
        self.ground()

    def rebalance(self, exclude: tuple[str, ...] = (), passes: int = 2) -> None:
        """Coordinate-descent over the balance levers (skipping any the fault owns) so a
        deliberately bad-form pose is still physically upright (COM over the base)."""
        levers = [lv for lv in self.BALANCE_LEVERS if not (set(lv) & set(exclude))]
        for _ in range(passes):
            for lever in levers:
                self.balance(lever)

    def _ball_penetration(self) -> float:
        pen = 0.0
        for i in range(self.data.ncon):
            c = self.data.contact[i]
            if c.geom1 == self.ball_gid or c.geom2 == self.ball_gid:
                pen = max(pen, -float(c.dist))
        return pen

    def place_ball(self, offset: tuple[float, float, float]) -> None:
        """Park the ball outward from the shooting hand (away from the torso, so it stays
        clear even when the trunk leans), `offset[0]` forward and `offset[2]` up (m),
        pushing further out if it would penetrate the body."""
        forward, _, up = offset
        self.forward()
        hand = self.data.geom_xpos[self.hand_gid].copy()
        torso = self.data.subtree_com[0]
        direction = hand[:2] - torso[:2]
        norm = float(np.linalg.norm(direction))
        unit = direction / norm if norm > 1e-6 else np.array([1.0, 0.0])
        reach = forward
        for _ in range(10):
            pos = np.array([hand[0] + unit[0] * reach, hand[1] + unit[1] * reach, hand[2] + up])
            self.data.qpos[self.ball_qadr : self.ball_qadr + 3] = pos
            self.data.qpos[self.ball_qadr + 3 : self.ball_qadr + 7] = [1.0, 0.0, 0.0, 0.0]
            self.forward()
            if self._ball_penetration() < 4e-3:
                break
            reach += 0.03

    # -- snapshot -----------------------------------------------------------
    def joint_angles_deg(self) -> dict[str, float]:
        return {j: round(self.get_angle(j), 4) for j in self.hinges}

    def root_pose(self) -> dict[str, list[float]]:
        q = self.data.qpos
        return {
            "pos": [round(float(x), 5) for x in q[0:3]],
            "quat": [round(float(x), 5) for x in q[3:7]],
        }

    def ball_pose(self) -> dict[str, list[float]]:
        a = self.ball_qadr
        q = self.data.qpos
        return {
            "pos": [round(float(x), 5) for x in q[a : a + 3]],
            "quat": [round(float(x), 5) for x in q[a + 3 : a + 7]],
        }

    def qpos(self) -> list[float]:
        return [round(float(x), 6) for x in self.data.qpos]
