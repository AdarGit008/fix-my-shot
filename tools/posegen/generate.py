"""Offline MJX pose-library generator (skeleton).

The real implementation lands with issue #8: seed a humanoid from dm_control's
suite/humanoid.xml, cross-check joint ranges against MyoHub/myo_sim, sample
phase-labeled poses, inject faults, and keep only gate-valid configurations
(ADR-0003 / ADR-0009). Output is static pose data consumed by the app.
"""


def main() -> None:
    raise NotImplementedError("posegen lands with issue #8 (MJX pose-library generation)")


if __name__ == "__main__":
    main()
