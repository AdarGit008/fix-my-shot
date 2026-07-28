// MuJoCo bootstrap for the physical-validity gate (issue #9).
//
// Owns one model+data pair on the WASM heap for gate evaluation, with no
// rendering attached. Works in both vitest-node and the browser: the module is
// imported lazily and loaded with NO `locateFile` — in node the Emscripten
// loader finds mujoco.wasm on disk next to mujoco.js by itself. The module is
// cached, so repeated `loadGateEngine` calls only pay for model compilation.

import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import { HandleRegistry } from '../spike/handles';

/** The loaded MuJoCo WASM module (Embind bindings). */
export type MujocoModule = MainModule;

/** Everything the gate needs to evaluate a configuration. */
export interface GateEngine {
  mj: MujocoModule;
  model: MjModel;
  data: MjData;
}

let modulePromise: Promise<MujocoModule> | null = null;

function loadModule(): Promise<MujocoModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const loadMujoco = (await import('@mujoco/mujoco')).default;
      return loadMujoco();
    })();
  }
  return modulePromise;
}

/**
 * Load (once) the MuJoCo module, compile `xml`, and return a gate engine.
 * `dispose()` frees the model+data Embind handles; it is idempotent, and the
 * cached module itself stays live for future engines.
 */
export async function loadGateEngine(xml: string): Promise<GateEngine & { dispose(): void }> {
  const mj = await loadModule();
  const registry = new HandleRegistry();
  const model = registry.track(mj.MjModel.from_xml_string(xml), 'model');
  const data = registry.track(new mj.MjData(model), 'data');
  return { mj, model, data, dispose: () => registry.disposeAll() };
}
