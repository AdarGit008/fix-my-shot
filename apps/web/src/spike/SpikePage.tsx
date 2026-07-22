// Engine spike page (issue #6) — a committed, self-measuring benchmark of the
// MuJoCo WASM humanoid+ball+floor scene against the SPEC §11.7 interactive
// budget. Renders the live scene, runs the three measurements on load, shows a
// go/no-go table, and publishes results to window.__SPIKE_RESULTS__ so a headless
// browser can read them (see tools/spike-measure.mjs).

import { useEffect, useRef, useState } from 'react';
import sceneXml from './scene.xml?raw';
import { loadEngine, MujocoView } from './mujoco-view';
import { DragController, installAutoDrag } from './drag';
import { regradeBenchmark, fpsStress, sceneInfo, verdict, type SpikeResults } from './measure';

declare global {
  interface Window {
    __SPIKE_RESULTS__?: SpikeResults;
    __SPIKE_ERROR__?: string;
  }
}

type Phase = 'loading' | 'measuring' | 'done' | 'error';

const NOTE =
  'Numbers are measured on the machine running the benchmark, not a defined ' +
  '"mid-range laptop" reference. A headless run additionally renders via ' +
  'software GL (SwiftShader), so its fps is a conservative floor for real hardware.';

export function SpikePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MujocoView | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [results, setResults] = useState<SpikeResults | null>(null);
  const [error, setError] = useState<string>('');
  const [mode, setMode] = useState<'static' | 'dynamics'>('static');

  useEffect(() => {
    let disposed = false;
    let detachDrag: (() => void) | null = null;

    (async () => {
      try {
        const engT0 = performance.now();
        const mj = await loadEngine();
        const moduleInitMs = performance.now() - engT0;
        if (disposed || !containerRef.current) return;

        const viewT0 = performance.now();
        const view = new MujocoView(mj, containerRef.current, sceneXml);
        viewRef.current = view;
        view.start(); // kick the render loop → first frame
        const firstFrameMs = performance.now() - viewT0;
        const totalFromNavMs = performance.now();

        // Interaction wiring: manual drag + a headless-friendly auto-drag.
        const drag = new DragController(view);
        detachDrag = drag.attach(view.renderer.domElement);
        const auto = installAutoDrag(view);

        setPhase('measuring');
        // Let one frame paint before we start hammering.
        await new Promise((r) => requestAnimationFrame(() => r(null)));

        const regrade = regradeBenchmark(view, 2000);
        const drag3s = await fpsStress(view, auto, 3000);
        view.reset(); // both benches leave the pose perturbed/fallen — restore it
        const load = { moduleInitMs, firstFrameMs, totalFromNavMs };
        const out: SpikeResults = {
          scene: sceneInfo(view),
          load,
          regrade,
          drag: drag3s,
          verdict: verdict(load, regrade, drag3s),
          note: NOTE,
        };
        window.__SPIKE_RESULTS__ = out;
        if (disposed) return;
        setResults(out);
        setPhase('done');
      } catch (e) {
        const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
        window.__SPIKE_ERROR__ = msg;
        if (!disposed) {
          setError(msg);
          setPhase('error');
        }
      }
    })();

    return () => {
      disposed = true;
      detachDrag?.();
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, []);

  function toggleMode() {
    const v = viewRef.current;
    if (!v) return;
    const next = v.mode === 'static' ? 'dynamics' : 'static';
    if (next === 'static') v.reset();
    v.mode = next;
    setMode(next);
  }

  return (
    <main style={S.page}>
      <header style={S.head}>
        <h1 style={S.h1}>fix-my-shot · engine spike</h1>
        <p style={S.sub}>
          MuJoCo WASM humanoid + ball + floor, benchmarked against the SPEC §11.7 interactive budget
          (issue&nbsp;#6).{' '}
          <a href="./" style={S.link}>
            ← app
          </a>
        </p>
      </header>

      <div style={S.split}>
        <div style={S.canvasWrap}>
          <div ref={containerRef} style={S.canvas} />
          <div style={S.toolbar}>
            <button style={S.btn} onClick={toggleMode}>
              {mode === 'static' ? '▶ run dynamics' : '⏸ hold pose (static)'}
            </button>
            <button style={S.btn} onClick={() => viewRef.current?.reset()}>
              ⟲ reset pose
            </button>
            <span style={S.hint}>
              drag a limb/ball · scroll to zoom · drag empty space to orbit
            </span>
          </div>
        </div>

        <aside style={S.panel}>
          {phase === 'loading' && <p>Loading MuJoCo WASM…</p>}
          {phase === 'measuring' && <p>Scene up — measuring load, re-grade, and drag fps…</p>}
          {phase === 'error' && (
            <>
              <h2 style={S.verdictBad}>ERROR</h2>
              <pre style={S.pre}>{error}</pre>
            </>
          )}
          {results && <ResultsPanel r={results} />}
        </aside>
      </div>
    </main>
  );
}

function ResultsPanel({ r }: { r: SpikeResults }) {
  const go = r.verdict.overall === 'GO';
  const rows: [string, string, boolean][] = [
    [r.verdict.load.budget, r.verdict.load.measured, r.verdict.load.pass],
    [r.verdict.regrade.budget, r.verdict.regrade.measured, r.verdict.regrade.pass],
    [r.verdict.drag.budget, r.verdict.drag.measured, r.verdict.drag.pass],
  ];
  return (
    <>
      <h2 style={go ? S.verdictGood : S.verdictBad}>{r.verdict.overall}</h2>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>budget</th>
            <th style={S.th}>measured</th>
            <th style={S.th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([b, m, pass]) => (
            <tr key={b}>
              <td style={S.td}>{b}</td>
              <td style={{ ...S.td, ...S.mono }}>{m}</td>
              <td style={{ ...S.td, textAlign: 'center' }}>
                <span style={pass ? S.pass : S.fail}>{pass ? 'PASS' : 'FAIL'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={S.meta}>
        scene: nq {r.scene.nq} · nv {r.scene.nv} · bodies {r.scene.nbody} · geoms {r.scene.ngeom} ·
        actuators {r.scene.nu}
        <br />
        module init {r.load.moduleInitMs.toFixed(0)} ms · first frame{' '}
        {r.load.firstFrameMs.toFixed(0)} ms · drag frames {r.drag.frames} in {r.drag.durationMs} ms
      </p>
      <p style={S.note}>{r.note}</p>
    </>
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
    height: '60vh',
    minHeight: 360,
    borderRadius: 10,
    overflow: 'hidden',
    background: '#14181f',
    border: '1px solid #222a35',
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
  hint: { color: '#6b7480', fontSize: 12.5 },
  panel: {
    flex: '1 1 320px',
    minWidth: 300,
    background: '#11161d',
    border: '1px solid #222a35',
    borderRadius: 10,
    padding: '16px 18px',
  },
  verdictGood: { margin: '0 0 12px', color: '#3fb950', fontSize: 34, letterSpacing: 1 },
  verdictBad: { margin: '0 0 12px', color: '#f85149', fontSize: 34, letterSpacing: 1 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: {
    textAlign: 'left',
    color: '#8b949e',
    fontWeight: 600,
    padding: '6px 8px',
    borderBottom: '1px solid #222a35',
  },
  td: { padding: '8px', borderBottom: '1px solid #1b222c', verticalAlign: 'top' },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 },
  meta: { color: '#8b949e', fontSize: 12.5, marginTop: 14, lineHeight: 1.6 },
  note: {
    color: '#6b7480',
    fontSize: 12,
    marginTop: 12,
    borderTop: '1px solid #1b222c',
    paddingTop: 10,
  },
  pass: { color: '#3fb950', fontWeight: 700, fontSize: 11.5, letterSpacing: 0.5 },
  fail: { color: '#f85149', fontWeight: 700, fontSize: 11.5, letterSpacing: 0.5 },
  pre: { whiteSpace: 'pre-wrap', color: '#f0a0a0', fontSize: 12, overflow: 'auto' },
};
