// Loader for the offline pose library (tools/posegen, issue #8). The JSON is generated,
// gate-valid, phase-labeled static data; this module types it and converts a library pose
// into a sport-agnostic core Pose across the package seam. Rendering the library is #14.

import type { Pose } from '@fix-my-shot/core';
import { PHASES } from '@fix-my-shot/basketball';
import libraryJson from './library.json';

export interface PoseGate {
  readonly jointLimits: boolean;
  readonly comInSupport: boolean;
  readonly maxPenetrationM: number;
  readonly valid: boolean;
}

/** A form conflict injected into a pose: a joint pushed off the baseline + the principle it breaks. */
export interface PoseFault {
  readonly joint: string;
  readonly principle: string;
  readonly deltaDeg: number;
}

export interface LibraryPose {
  readonly id: string;
  readonly phase: string;
  readonly kind: 'clean' | 'faulted';
  readonly seed: number;
  readonly faults: readonly PoseFault[];
  readonly jointAnglesDeg: Readonly<Record<string, number>>;
  readonly root: {
    readonly pos: readonly [number, number, number];
    readonly quat: readonly [number, number, number, number];
  };
  readonly ball: {
    readonly pos: readonly [number, number, number];
    readonly quat: readonly [number, number, number, number];
  };
  readonly qpos: readonly number[];
  readonly gate: PoseGate;
  readonly valid: boolean;
}

export interface PoseLibrary {
  readonly version: number;
  readonly generator: string;
  readonly model: string;
  readonly seed: number;
  readonly jointOrder: readonly string[];
  readonly phases: readonly string[];
  readonly poseCount: number;
  readonly poses: readonly LibraryPose[];
}

export const POSE_LIBRARY = libraryJson as unknown as PoseLibrary;

/**
 * Convert a library pose to a sport-agnostic core Pose. The ball orientation is remapped
 * from MuJoCo's [w, x, y, z] quaternion to core's [x, y, z, w].
 */
export function toCorePose(pose: LibraryPose): Pose {
  const phase = PHASES.find((p) => p.id === pose.phase);
  if (!phase) {
    throw new Error(`pose '${pose.id}' has unknown phase '${pose.phase}'`);
  }
  const q = pose.ball.quat;
  return {
    phase,
    jointAngles: pose.jointAnglesDeg,
    implement: {
      id: 'ball',
      position: pose.ball.pos,
      orientation: [q[1], q[2], q[3], q[0]],
    },
  };
}
