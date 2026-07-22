// Embind lifecycle helper — issue #6 scope: "Wrap Embind `.delete()` lifecycle
// in a helper from day one (leak-prone)."
//
// Every Embind-wrapped C++ object (MjModel, MjData, MjvScene, MjvPerturb,
// MjvCamera, MjvOption, DoubleBuffer, …) lives on the WASM heap and is NOT
// garbage-collected. It must be `.delete()`d exactly once. Double-delete is an
// error; a missed delete is a heap leak. This registry makes lifetimes explicit:
// every handle is `track`ed on creation and freed in LIFO order by `disposeAll`.

/** Minimal shape of an Embind handle: everything exposes `.delete()`. */
export interface Deletable {
  delete(): void;
  isDeleted?(): boolean;
}

/**
 * Tracks Embind handles and frees them deterministically. One registry per
 * owned scene/session; call `disposeAll()` on teardown (React unmount, reload).
 */
export class HandleRegistry {
  #handles: Deletable[] = [];
  #disposed = false;

  /** Register a freshly-created handle and return it (typed passthrough). */
  track<T extends Deletable>(handle: T, label?: string): T {
    if (this.#disposed) {
      // Fail loud: tracking into a disposed registry means the handle leaks.
      throw new Error(`HandleRegistry: track(${label ?? '?'}) after disposeAll`);
    }
    this.#handles.push(handle);
    return handle;
  }

  /** Number of live tracked handles (for leak assertions / the spike readout). */
  get size(): number {
    return this.#handles.length;
  }

  /**
   * Delete every tracked handle in reverse creation order (children before the
   * model they depend on), swallowing double-delete guards. Idempotent.
   */
  disposeAll(): void {
    this.#disposed = true;
    for (let i = this.#handles.length - 1; i >= 0; i--) {
      const h = this.#handles[i];
      if (!h) continue;
      try {
        if (!h.isDeleted?.()) h.delete();
      } catch {
        // Already deleted or invalid — nothing left to free.
      }
    }
    this.#handles.length = 0;
  }
}

/**
 * Run `fn` with a scratch handle that is always deleted afterwards, even if `fn`
 * throws — the finally-block pattern the package README calls out for buffers
 * and short-lived structs.
 */
export function withHandle<T extends Deletable, R>(handle: T, fn: (h: T) => R): R {
  try {
    return fn(handle);
  } finally {
    try {
      handle.delete();
    } catch {
      /* already freed */
    }
  }
}
