import { SpikePage } from './spike/SpikePage';
import { EditorPage } from './editor/EditorPage';
import { ProgressPanel } from './progress/ProgressPanel';

// The app shell (issue #14): the DEFAULT route is the core loop — generate
// (pick a library pose) → edit behind the gate → re-grade → ranked report →
// progress (SPEC §2). The engine spike (issue #6) and the progress history
// view (issue #13) stay deep-linkable behind query flags; `?editor` remains an
// alias of the default for continuity with issue #10's links.
export function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('spike')) {
    return <SpikePage />;
  }
  if (params.has('history')) {
    return <ProgressPanel />;
  }
  return <EditorPage />;
}
