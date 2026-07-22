// Drag interaction for the spike — a compact port of the interaction pattern in
// zalo/mujoco_wasm's DragStateManager (issue #6 scope: vendor it as reference).
//
// Grab a body by raycast, then each frame pull it toward a target world point
// with MuJoCo's own perturbation force (mjv_applyPerturbForce → xfrc_applied),
// stepping dynamics so the pull resolves. This is the per-frame cost that the
// ">= 30 fps drag" budget is really about: perturb + full dynamics + render.

import * as THREE from 'three';
import type { MjvPerturb } from '@mujoco/mujoco';
import type { MujocoView } from './mujoco-view';

const PERT_TRANSLATE = 1; // mjPERT_TRANSLATE

/** Set the perturb target (MuJoCo world coords) into perturb.refpos. */
function setRefpos(perturb: MjvPerturb, x: number, y: number, z: number): void {
  perturb.refpos[0] = x;
  perturb.refpos[1] = y;
  perturb.refpos[2] = z;
}

/**
 * Mouse-driven body drag. Wire `attach()` to the canvas; it manages a MuJoCo
 * perturbation and flips the view into dynamics while a body is held.
 */
export class DragController {
  private readonly view: MujocoView;
  private readonly perturb: MjvPerturb;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane();
  private readonly hit = new THREE.Vector3();
  private prevMode: MujocoView['mode'] = 'static';
  private active = false;

  constructor(view: MujocoView) {
    this.view = view;
    this.perturb = view.registry.track(new view.mj.MjvPerturb(), 'perturb');
    view.mj.mjv_defaultPerturb(this.perturb);
  }

  attach(el: HTMLElement): () => void {
    const down = (e: PointerEvent) => this.onDown(e, el);
    const move = (e: PointerEvent) => this.onMove(e, el);
    const up = () => this.release();
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }

  private toNdc(e: PointerEvent, el: HTMLElement): void {
    const r = el.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  private onDown(e: PointerEvent, el: HTMLElement): void {
    this.toNdc(e, el);
    this.raycaster.setFromCamera(this.ndc, this.view.camera);
    const grab = this.view.raycastBody(this.raycaster);
    if (!grab) return;

    // Camera-facing drag plane through the grab point.
    const camDir = new THREE.Vector3();
    this.view.camera.getWorldDirection(camDir);
    this.plane.setFromNormalAndCoplanarPoint(camDir, grab.point);

    this.perturb.select = grab.bodyid;
    this.perturb.active = PERT_TRANSLATE;
    this.perturb.localpos[0] = 0;
    this.perturb.localpos[1] = 0;
    this.perturb.localpos[2] = 0;
    const mj = this.view.mjRoot.worldToLocal(grab.point.clone());
    setRefpos(this.perturb, mj.x, mj.y, mj.z);

    this.prevMode = this.view.mode;
    this.view.mode = 'dynamics';
    this.view.beforePhysics = () =>
      this.view.mj.mjv_applyPerturbForce(this.view.model, this.view.data, this.perturb);
    this.active = true;
    this.view.controls.enabled = false; // don't orbit while dragging a body
  }

  private onMove(e: PointerEvent, el: HTMLElement): void {
    if (!this.active) return;
    this.toNdc(e, el);
    this.raycaster.setFromCamera(this.ndc, this.view.camera);
    if (!this.raycaster.ray.intersectPlane(this.plane, this.hit)) return;
    const mj = this.view.mjRoot.worldToLocal(this.hit.clone());
    setRefpos(this.perturb, mj.x, mj.y, mj.z);
  }

  release(): void {
    if (!this.active) return;
    this.active = false;
    this.perturb.active = 0;
    this.view.beforePhysics = null;
    // Clear the residual applied force on the released body.
    const b = this.perturb.select as number;
    const xf = this.view.data.xfrc_applied;
    for (let i = 0; i < 6; i++) xf[b * 6 + i] = 0;
    this.view.mode = this.prevMode;
    this.view.controls.enabled = true;
  }
}

export interface DragStress {
  start(): void;
  stop(): void;
}

/**
 * Headless-friendly auto-drag: grab a named body and orbit its target in a
 * horizontal circle, applying the same perturb-force path as a real drag. Lets
 * the fps benchmark run with no pointer. Returns start/stop controls.
 */
export function installAutoDrag(view: MujocoView, bodyName = 'ball', radius = 0.35): DragStress {
  const accessor = view.model.body(bodyName);
  const bodyid = accessor.id as number;
  accessor.delete(); // accessor is a heap handle; keep only the id

  const perturb = view.registry.track(new view.mj.MjvPerturb(), 'auto-perturb');
  view.mj.mjv_defaultPerturb(perturb);
  perturb.select = bodyid;
  perturb.active = PERT_TRANSLATE;
  perturb.localpos[0] = 0;
  perturb.localpos[1] = 0;
  perturb.localpos[2] = 0;

  // Centre the orbit on the body's current position.
  const cx = view.data.xpos[bodyid * 3];
  const cy = view.data.xpos[bodyid * 3 + 1];
  const cz = view.data.xpos[bodyid * 3 + 2];
  let phase = 0;
  let prevMode: MujocoView['mode'] = 'static';

  return {
    start() {
      prevMode = view.mode;
      view.mode = 'dynamics';
      view.beforePhysics = () => {
        phase += 0.12;
        setRefpos(perturb, cx + radius * Math.cos(phase), cy + radius * Math.sin(phase), cz);
        view.mj.mjv_applyPerturbForce(view.model, view.data, perturb);
      };
    },
    stop() {
      view.beforePhysics = null;
      perturb.active = 0;
      const xf = view.data.xfrc_applied;
      for (let i = 0; i < 6; i++) xf[bodyid * 6 + i] = 0;
      view.mode = prevMode;
    },
  };
}
