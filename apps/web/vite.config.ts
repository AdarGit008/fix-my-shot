import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // @mujoco/mujoco is a pre-compiled Emscripten ES module that locates its .wasm
  // via `new URL('mujoco.wasm', import.meta.url)`. Excluding it from esbuild
  // dep-optimization keeps that URL (and our `?url` import of the wasm) intact.
  optimizeDeps: { exclude: ['@mujoco/mujoco'] },
});
