// Pose editor page (issue #10, ADR-0009/0010) — the user-facing edit step of the
// core loop: pick a phase-labelled library pose, drag joints or the ball inside
// the phase envelope, watch the gate accept or visibly reject-and-revert.
//
// Architecture: MujocoView renders (static mode, its own MjData); the gate gets a
// SECOND MjData on the same compiled model, so projections never scramble the
// rendered pose. All edit logic lives in EditorSession (DOM-free, tested); this
// page owns only pointers, the three.js↔MuJoCo coordinate hop, and the panel UI.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PHASES } from '@fix-my-shot/basketball';
import sceneXml from '../spike/scene.xml?raw';
import { MujocoView, loadEngine } from '../spike/mujoco-view';
import { createGate, type Gate, type GateEngine } from '../gate';
import { POSE_LIBRARY } from '../poses';
import type { EditorVerdict } from './session';
import { EditorSession, createBoundsProvider, type BoundsProvider } from './session';

type Boot = 'loading' | 'ready' | 'error';

interface VerdictNote {
  readonly accepted: boolean;
  readonly detail: string;
}

/** Human-readable failure list for a rejected drag. */
function describeRejection(verdict: EditorVerdict): string {
  const reasons: string[] = [];
  if (!verdict.gate.jointLimits) reasons.push('anatomical joint limits');
  if (!verdict.gate.comInSupport) reasons.push('balance (COM outside the base)');
  if (verdict.gate.maxPenetrationM > 0.005) {
    reasons.push(`contact penetration ${(verdict.gate.maxPenetrationM * 1000).toFixed(1)} mm`);
  }
  for (const v of verdict.boundViolations.slice(0, 3)) {
    reasons.push(`${v.parameter} outside its phase window`);
  }
  if (verdict.boundViolations.length > 3) {
    reasons.push(`+${verdict.boundViolations.length - 3} more phase bounds`);
  }
  return reasons.length > 0 ? reasons.join(' · ') : 'edit infeasible from this pose';
}

export function EditorPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MujocoView | null>(null);
  const sessionRef = useRef<EditorSession | null>(null);
  const gateRef = useRef<Gate | null>(null);
  const boundsRef = useRef<BoundsProvider | null>(null);

  const dragRef = useRef<{
    pointerId: number;
    plane: THREE.Plane;
    lastMj: [number, number, number];
  } | null>(null);
  const raycaster = useRef(new THREE.Raycaster()).current;
  const ndc = useRef(new THREE.Vector2()).current;

  const [boot, setBoot] = useState<Boot>('loading');
  const [error, setError] = useState('');
  const [poseId, setPoseId] = useState('stance-clean');
  const [verdict, setVerdict] = useState<VerdictNote | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [flash, setFlash] = useState<'none' | 'accept' | 'reject'>('none');
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Push the session's display pose into the render view. */
  const syncView = useCallback(() => {
    const view = viewRef.current;
    const session = sessionRef.current;
    if (!view || !session) return;
    (view.data.qpos as Float64Array).set(session.displayQpos);
  }, []);

  const showVerdict = useCallback((note: VerdictNote) => {
    setVerdict(note);
    setFlash(note.accepted ? 'accept' : 'reject');
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash('none'), 1600);
  }, []);

  const loadPose = useCallback(
    (id: string) => {
      const session = sessionRef.current;
      const pose = POSE_LIBRARY.poses.find((p) => p.id === id);
      if (!session || !pose) return;
      session.load(pose);
      setPoseId(id);
      setVerdict(null);
      setCanUndo(false);
      syncView();
    },
    [syncView],
  );

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        const mj = await loadEngine();
        if (disposed || !containerRef.current) return;
        const view = new MujocoView(mj, containerRef.current, sceneXml);
        viewRef.current = view;

        // The gate's own MjData on the shared compiled model (see header).
        const gateData = view.registry.track(new mj.MjData(view.model), 'gate-data');
        const engine: GateEngine = { mj, model: view.model, data: gateData };
        const gate = createGate(engine);
        gateRef.current = gate;
        const bounds = createBoundsProvider(engine);
        boundsRef.current = bounds;
        sessionRef.current = new EditorSession(gate, bounds);

        view.mode = 'static';
        view.start();
        setBoot('ready');
      } catch (e) {
        if (!disposed) {
          setError(e instanceof Error ? (e.stack ?? e.message) : String(e));
          setBoot('error');
        }
      }
    })();

    return () => {
      disposed = true;
      if (flashTimer.current) clearTimeout(flashTimer.current);
      gateRef.current?.dispose();
      boundsRef.current?.dispose();
      viewRef.current?.dispose();
      gateRef.current = null;
      boundsRef.current = null;
      sessionRef.current = null;
      viewRef.current = null;
    };
  }, []);

  // Load the initial pose exactly once, when the engine comes up; later pose
  // switches go through loadPose directly from the <select>.
  const initialLoaded = useRef(false);
  useEffect(() => {
    if (boot !== 'ready' || initialLoaded.current) return;
    initialLoaded.current = true;
    loadPose(poseId);
  }, [boot, loadPose, poseId]);

  const toNdc = useCallback(
    (e: React.PointerEvent) => {
      const view = viewRef.current;
      if (!view) return;
      const r = view.renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    },
    [ndc],
  );

  /** Pointer NDC → drag-plane hit → MuJoCo world coords (z-up). */
  const pointerToMj = useCallback(
    (e: React.PointerEvent): [number, number, number] | null => {
      const view = viewRef.current;
      const drag = dragRef.current;
      if (!view || !drag) return null;
      toNdc(e);
      raycaster.setFromCamera(ndc, view.camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(drag.plane, hit)) return null;
      const mjPoint = view.mjRoot.worldToLocal(hit.clone());
      return [mjPoint.x, mjPoint.y, mjPoint.z];
    },
    [ndc, raycaster, toNdc],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const view = viewRef.current;
      const session = sessionRef.current;
      if (!view || !session || dragRef.current) return;
      toNdc(e);
      raycaster.setFromCamera(ndc, view.camera);
      const grab = view.raycastBody(raycaster);
      if (!grab) return; // empty space → OrbitControls keeps the event

      const camDir = new THREE.Vector3();
      view.camera.getWorldDirection(camDir);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, grab.point);
      const mjPoint = view.mjRoot.worldToLocal(grab.point.clone());

      session.beginDrag({ frameType: 'geom', frameId: grab.geomid });
      dragRef.current = {
        pointerId: e.pointerId,
        plane,
        lastMj: [mjPoint.x, mjPoint.y, mjPoint.z],
      };
      view.controls.enabled = false;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [ndc, raycaster, toNdc],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const session = sessionRef.current;
      const drag = dragRef.current;
      if (!session || !drag || e.pointerId !== drag.pointerId) return;
      const mjPoint = pointerToMj(e);
      if (!mjPoint) return;
      drag.lastMj = mjPoint;
      session.previewDrag(mjPoint);
      syncView();
    },
    [pointerToMj, syncView],
  );

  const finishDrag = useCallback(
    (e: React.PointerEvent, cancelled: boolean) => {
      const view = viewRef.current;
      const session = sessionRef.current;
      const drag = dragRef.current;
      if (!view || !session || !drag || e.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      view.controls.enabled = true;

      if (cancelled) {
        session.cancelDrag();
      } else {
        const result = session.endDrag(pointerToMj(e) ?? drag.lastMj);
        showVerdict(
          result.accepted
            ? { accepted: true, detail: 'gate-valid and inside the phase envelope' }
            : { accepted: false, detail: describeRejection(result) },
        );
        setCanUndo(session.canUndo);
      }
      syncView();
    },
    [pointerToMj, showVerdict, syncView],
  );

  const pose = POSE_LIBRARY.poses.find((p) => p.id === poseId);
  const phaseLabel = PHASES.find((p) => p.id === pose?.phase)?.label ?? pose?.phase ?? '';
  const border =
    flash === 'accept' ? '#3fb950' : flash === 'reject' ? '#f85149' : '#222a35';

  return (
    <main style={S.page}>
      <header style={S.head}>
        <h1 style={S.h1}>fix-my-shot · pose editor</h1>
        <p style={S.sub}>
          Drag a joint or the ball — every edit is clamped to the pose&apos;s phase and judged by
          the physical-validity gate (issue&nbsp;#10).{' '}
          <a href="./" style={S.link}>
            ← app
          </a>
        </p>
      </header>

      <div style={S.split}>
        <div style={S.canvasWrap}>
          <div
            ref={containerRef}
            style={{ ...S.canvas, borderColor: border, transition: 'border-color 250ms' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => finishDrag(e, false)}
            onPointerCancel={(e) => finishDrag(e, true)}
          />
          <div style={S.toolbar}>
            <button
              style={{ ...S.btn, opacity: canUndo ? 1 : 0.45 }}
              disabled={!canUndo}
              onClick={() => {
                const session = sessionRef.current;
                if (!session?.undo()) return;
                setCanUndo(session.canUndo);
                setVerdict(null);
                syncView();
              }}
            >
              ↶ undo edit
            </button>
            <button
              style={S.btnGhost}
              onClick={() => {
                sessionRef.current?.reset();
                setCanUndo(false);
                setVerdict(null);
                syncView();
              }}
            >
              ⟲ reset pose
            </button>
            <span style={S.hint}>drag a limb/ball · empty space orbits · scroll zooms</span>
          </div>
        </div>

        <aside style={S.panel}>
          {boot === 'loading' && <p>Loading MuJoCo WASM…</p>}
          {boot === 'error' && <pre style={S.pre}>{error}</pre>}
          {boot === 'ready' && pose && (
            <>
              <label style={S.label} htmlFor="pose-select">
                library pose
              </label>
              <select
                id="pose-select"
                style={S.select}
                value={poseId}
                onChange={(e) => loadPose(e.target.value)}
              >
                {PHASES.map((phase) => (
                  <optgroup key={phase.id} label={phase.label}>
                    {POSE_LIBRARY.poses
                      .filter((p) => p.phase === phase.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id}
                          {p.kind === 'faulted' ? ' ⚠' : ''}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>

              <div style={S.chipRow}>
                <span style={S.phaseChip}>{phaseLabel}</span>
                <span style={S.pinned}>phase pinned — edits stay in range (ADR-0009)</span>
              </div>

              {pose.kind === 'faulted' && (
                <div style={S.faults}>
                  <span style={S.faultTitle}>injected form faults to fix:</span>
                  {pose.faults.map((f, i) => (
                    <span key={i} style={S.faultChip}>
                      {f.principle} ({f.joint} {f.deltaDeg > 0 ? '+' : ''}
                      {f.deltaDeg.toFixed(0)}°)
                    </span>
                  ))}
                </div>
              )}

              <div style={S.verdictBox}>
                {verdict === null && <span style={S.idle}>make an edit to get a verdict…</span>}
                {verdict?.accepted === true && (
                  <span style={S.ok}>✓ edit accepted — {verdict.detail}</span>
                )}
                {verdict?.accepted === false && (
                  <span style={S.bad}>✕ edit rejected &amp; reverted — {verdict.detail}</span>
                )}
              </div>

              <p style={S.meta}>
                The drag preview is the gate&apos;s own constrained projection (a few steps per
                pointer frame — ADR-0010), so what you see while dragging already respects the
                phase envelope; releasing runs the full projection and the three-check authority:
                joint limits, balance, contact.
              </p>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    font: '15px/1.5 system-ui, sans-serif',
    color: '#e6e9ef',
    background: '#0d1117',
    minHeight: '100vh',
    margin: 0,
    padding: '20px 24px',
  },
  head: { marginBottom: 16 },
  h1: { margin: '0 0 4px', fontSize: 22 },
  sub: { margin: 0, color: '#9aa4b2', fontSize: 14 },
  link: { color: '#6cb6ff' },
  split: { display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' },
  canvasWrap: { flex: '1 1 520px', minWidth: 320 },
  canvas: {
    width: '100%',
    height: '62vh',
    minHeight: 380,
    borderRadius: 10,
    overflow: 'hidden',
    background: '#14181f',
    border: '2px solid #222a35',
    touchAction: 'none',
  },
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' },
  btn: {
    background: '#1f6feb',
    color: '#fff',
    border: 0,
    borderRadius: 7,
    padding: '7px 12px',
    cursor: 'pointer',
    fontSize: 14,
  },
  btnGhost: {
    background: 'transparent',
    color: '#9aa4b2',
    border: '1px solid #30363d',
    borderRadius: 7,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 14,
  },
  hint: { color: '#6b7480', fontSize: 12.5 },
  panel: {
    flex: '1 1 320px',
    minWidth: 300,
    background: '#11161d',
    border: '1px solid #222a35',
    borderRadius: 10,
    padding: '16px 18px',
  },
  label: { display: 'block', color: '#8b949e', fontSize: 12.5, marginBottom: 6 },
  select: {
    width: '100%',
    background: '#0d1117',
    color: '#e6e9ef',
    border: '1px solid #30363d',
    borderRadius: 7,
    padding: '8px 10px',
    fontSize: 14,
  },
  chipRow: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' },
  phaseChip: {
    background: '#1f6feb22',
    color: '#6cb6ff',
    border: '1px solid #1f6feb55',
    borderRadius: 999,
    padding: '3px 10px',
    fontSize: 12.5,
    fontWeight: 600,
  },
  pinned: { color: '#6b7480', fontSize: 12 },
  faults: { marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline' },
  faultTitle: { color: '#8b949e', fontSize: 12.5, marginRight: 2 },
  faultChip: {
    background: '#f8514915',
    color: '#f0a0a0',
    border: '1px solid #f8514940',
    borderRadius: 999,
    padding: '2px 9px',
    fontSize: 12,
  },
  verdictBox: {
    marginTop: 14,
    padding: '10px 12px',
    borderRadius: 8,
    background: '#0d1117',
    border: '1px solid #1b222c',
    minHeight: 40,
    fontSize: 13.5,
  },
  idle: { color: '#6b7480' },
  ok: { color: '#3fb950' },
  bad: { color: '#f85149' },
  meta: { color: '#8b949e', fontSize: 12.5, marginTop: 14, lineHeight: 1.6 },
  pre: { whiteSpace: 'pre-wrap', color: '#f0a0a0', fontSize: 12, overflow: 'auto' },
};
