// MuJoCo WASM ↔ three.js bridge for the engine spike (issue #6).
//
// Loads the official @mujoco/mujoco single-threaded build (no COOP/COEP needed),
// builds one three.js primitive mesh per MuJoCo geom, and syncs world transforms
// every frame. MuJoCo is z-up; three.js is y-up — the whole model sits under a
// root group rotated -90° about X, the convention vendored from zalo/mujoco_wasm.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import loadMujoco from '@mujoco/mujoco';
import type { MjModel, MjData } from '@mujoco/mujoco';
import wasmUrl from '@mujoco/mujoco/mujoco.wasm?url';
import { HandleRegistry } from './handles';

export type Mujoco = Awaited<ReturnType<typeof loadMujoco>>;

// mjtGeom enum values we render.
const GEOM = { PLANE: 0, SPHERE: 2, CAPSULE: 3, ELLIPSOID: 4, CYLINDER: 5, BOX: 6 } as const;

let enginePromise: Promise<Mujoco> | null = null;

/** Load (once) the MuJoCo WASM engine, pointing the loader at Vite's asset URL. */
export function loadEngine(): Promise<Mujoco> {
  if (!enginePromise) {
    enginePromise = loadMujoco({
      locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path),
    });
  }
  return enginePromise;
}

export type SimMode = 'static' | 'dynamics';

export interface FrameStats {
  fps: number;
  frameMs: number; // wall time of the last CPU frame (physics + sync + render)
  physicsMs: number;
  renderMs: number;
}

/**
 * Owns a MuJoCo model+data, the three.js render stack, and the geom↔mesh sync.
 * `static` mode holds the pose and re-evaluates with mj_forward (the product's
 * quasi-static path, ADR-0003); `dynamics` mode runs mj_step for a live demo.
 */
export class MujocoView {
  readonly mj: Mujoco;
  readonly model: MjModel;
  readonly data: MjData;
  readonly registry = new HandleRegistry();

  mode: SimMode = 'static';
  stats: FrameStats = { fps: 0, frameMs: 0, physicsMs: 0, renderMs: 0 };

  /** Hook run inside step() before physics — the drag manager applies its
   * perturbation force here so it lands on the same frame that steps. */
  beforePhysics: (() => void) | null = null;

  readonly scene = new THREE.Scene();
  readonly mjRoot = new THREE.Group(); // holds all geom meshes; z-up → y-up
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  /** One mesh per geom, index-aligned with MuJoCo geom ids. */
  readonly meshes: THREE.Mesh[] = [];
  private raf = 0;
  private frames = 0;
  private fpsWindowStart = 0;
  private readonly canvas: HTMLCanvasElement;
  private readonly ro: ResizeObserver;
  private readonly tmp = new THREE.Matrix4();

  constructor(mj: Mujoco, container: HTMLElement, xml: string) {
    this.mj = mj;
    this.model = this.registry.track(mj.MjModel.from_xml_string(xml), 'model');
    this.data = this.registry.track(new mj.MjData(this.model), 'data');
    mj.mj_forward(this.model, this.data);

    // ── three.js stack ────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvas = this.renderer.domElement;
    container.appendChild(this.canvas);

    this.scene.background = new THREE.Color(0x14181f);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 6, 4);
    this.scene.add(key);

    this.mjRoot.rotation.x = -Math.PI / 2; // MuJoCo world z-up → three y-up
    this.scene.add(this.mjRoot);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    this.camera.position.set(2.4, 1.4, 2.4);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 1.0, 0);
    this.controls.enableDamping = true;

    this.buildMeshes();
    this.syncGeoms();

    this.ro = new ResizeObserver(() => this.resize(container));
    this.ro.observe(container);
    this.resize(container);
  }

  /** Static factory: ensure the engine is loaded, then construct. */
  static async create(container: HTMLElement, xml: string): Promise<MujocoView> {
    const mj = await loadEngine();
    return new MujocoView(mj, container, xml);
  }

  private geomColor(g: number): THREE.Color {
    const matid = this.model.geom_matid[g] as number;
    const src = matid >= 0 ? this.model.mat_rgba : this.model.geom_rgba;
    const base = matid >= 0 ? matid * 4 : g * 4;
    return new THREE.Color(src[base], src[base + 1], src[base + 2]);
  }

  private buildMeshes(): void {
    const model = this.model;
    const ngeom = model.ngeom as number;
    const type = model.geom_type;
    const size = model.geom_size;

    for (let g = 0; g < ngeom; g++) {
      const s0 = size[g * 3],
        s1 = size[g * 3 + 1],
        s2 = size[g * 3 + 2];
      let geometry: THREE.BufferGeometry;
      let scale: THREE.Vector3 | null = null;

      switch (type[g]) {
        case GEOM.PLANE:
          // MuJoCo planes are infinite (size 0); render a large finite slab.
          geometry = new THREE.PlaneGeometry(20, 20, 1, 1);
          break;
        case GEOM.SPHERE:
          geometry = new THREE.SphereGeometry(s0, 24, 16);
          break;
        case GEOM.ELLIPSOID:
          geometry = new THREE.SphereGeometry(1, 24, 16);
          scale = new THREE.Vector3(s0, s1, s2);
          break;
        case GEOM.CAPSULE:
          // three capsule axis is Y; MuJoCo local axis is Z. Bake a +90°X into
          // the geometry so applying geom_xmat orients it correctly.
          geometry = new THREE.CapsuleGeometry(s0, 2 * s1, 8, 16);
          geometry.rotateX(Math.PI / 2);
          break;
        case GEOM.CYLINDER:
          geometry = new THREE.CylinderGeometry(s0, s0, 2 * s1, 20);
          geometry.rotateX(Math.PI / 2);
          break;
        case GEOM.BOX:
          geometry = new THREE.BoxGeometry(2 * s0, 2 * s1, 2 * s2);
          break;
        default:
          geometry = new THREE.SphereGeometry(Math.max(s0, 0.02), 8, 6);
      }

      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: this.geomColor(g),
          metalness: 0.05,
          roughness: 0.75,
        }),
      );
      if (scale) mesh.scale.copy(scale);
      mesh.userData.baseScale = scale; // preserve ellipsoid scale across syncs
      this.mjRoot.add(mesh);
      this.meshes.push(mesh);
    }
  }

  /** Copy every geom's world transform from MuJoCo into its three.js mesh. */
  private syncGeoms(): void {
    const xpos = this.data.geom_xpos;
    const xmat = this.data.geom_xmat;
    for (let g = 0; g < this.meshes.length; g++) {
      const m = this.meshes[g];
      if (!m) continue;
      m.position.set(xpos[g * 3], xpos[g * 3 + 1], xpos[g * 3 + 2]);
      const b = g * 9;
      // geom_xmat is row-major 3x3; Matrix4.set takes row-major args.
      this.tmp.set(
        xmat[b],
        xmat[b + 1],
        xmat[b + 2],
        0,
        xmat[b + 3],
        xmat[b + 4],
        xmat[b + 5],
        0,
        xmat[b + 6],
        xmat[b + 7],
        xmat[b + 8],
        0,
        0,
        0,
        0,
        1,
      );
      m.quaternion.setFromRotationMatrix(this.tmp);
    }
  }

  /** Advance physics per current mode. Returns the physics wall time (ms). */
  step(): number {
    this.beforePhysics?.();
    const t = performance.now();
    if (this.mode === 'dynamics') this.mj.mj_step(this.model, this.data);
    else this.mj.mj_forward(this.model, this.data);
    return performance.now() - t;
  }

  /** Raycast the geom meshes; return the hit MuJoCo body id + world point. */
  raycastBody(raycaster: THREE.Raycaster): { bodyid: number; point: THREE.Vector3 } | null {
    const hits = raycaster.intersectObjects(this.meshes, false);
    for (const hit of hits) {
      const g = this.meshes.indexOf(hit.object as THREE.Mesh);
      if (g < 0) continue;
      const bodyid = this.model.geom_bodyid[g] as number;
      if (bodyid <= 0) continue; // 0 = worldbody (floor) — not grabbable
      return { bodyid, point: hit.point.clone() };
    }
    return null;
  }

  /** One full frame: physics → geom sync → render. Updates `stats`. */
  tick(): void {
    const t0 = performance.now();
    const physicsMs = this.step();
    this.syncGeoms();
    const tR = performance.now();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    const now = performance.now();

    this.frames++;
    if (now - this.fpsWindowStart >= 500) {
      this.stats.fps = (this.frames * 1000) / (now - this.fpsWindowStart);
      this.frames = 0;
      this.fpsWindowStart = now;
    }
    this.stats.physicsMs = physicsMs;
    this.stats.renderMs = now - tR;
    this.stats.frameMs = now - t0;
  }

  start(): void {
    if (this.raf) return;
    this.fpsWindowStart = performance.now();
    const loop = () => {
      this.tick();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  reset(): void {
    this.mj.mj_resetData(this.model, this.data);
    this.mj.mj_forward(this.model, this.data);
    this.syncGeoms();
  }

  private resize(container: HTMLElement): void {
    const w = container.clientWidth || 640;
    const h = container.clientHeight || 480;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.stop();
    this.ro.disconnect();
    this.controls.dispose();
    for (const m of this.meshes) {
      (m as THREE.Mesh).geometry?.dispose();
      const mat = (m as THREE.Mesh).material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    }
    this.renderer.dispose();
    this.canvas.remove();
    this.registry.disposeAll(); // frees model + data on the WASM heap
  }
}
