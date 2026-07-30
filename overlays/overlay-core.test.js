import { describe, it, expect, vi } from 'vitest';
import { defineOverlay } from './overlay-core.js';

// overlay-core is a classic browser script (CJS-guarded like theme-helpers.js).
// In production `defineOverlay` calls the global `stateSync(update)` itself; the
// tests inject a fake via `opts._stateSync` so we can drive states by hand and
// keep everything deterministic (no polling, no timers).

// Minimal fake DOM element — only the shape overlay-core actually touches.
function makeEl() {
  return {
    innerHTML: '',
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
}

// A controllable stateSync seam: captures the update callback so the test can
// push states, and records how many times defineOverlay wired itself in.
function makeStateSync() {
  const s = {
    callback: null,
    calls: 0,
    push(state) {
      if (s.callback) s.callback(state);
    },
  };
  s.fn = vi.fn((cb) => {
    s.calls += 1;
    s.callback = cb;
  });
  return s;
}

describe('overlay-core defineOverlay', () => {
  // Contract 1: render fires on first state, and again only when key changes.
  it('renders on first state and re-renders only when key output changes', async () => {
    const el = makeEl();
    const render = vi.fn();
    const sync = makeStateSync();
    const handle = defineOverlay(
      { el, key: (s) => [s.score], render },
      { _stateSync: sync.fn }
    );
    await handle.ready;

    sync.push({ score: 1 });
    expect(render).toHaveBeenCalledTimes(1);

    sync.push({ score: 1 }); // same key → deduped
    expect(render).toHaveBeenCalledTimes(1);

    sync.push({ score: 2 }); // key changed → renders
    expect(render).toHaveBeenCalledTimes(2);
  });

  // Contract 2: validate === false skips render AND does not commit the key,
  // so a later valid frame with the SAME key still renders (no latch).
  it('does not render or commit key on an invalid frame; same key later renders', async () => {
    const el = makeEl();
    const render = vi.fn();
    const sync = makeStateSync();
    let ok = false;
    const handle = defineOverlay(
      { el, key: (s) => [s.v], render, validate: () => ok },
      { _stateSync: sync.fn }
    );
    await handle.ready;

    sync.push({ v: 7 }); // invalid → skipped, key NOT committed
    expect(render).toHaveBeenCalledTimes(0);

    ok = true;
    sync.push({ v: 7 }); // same key, now valid → must render (no latch)
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('treats only strict false as skip (a truthy/undefined validate does not block)', async () => {
    const el = makeEl();
    const render = vi.fn();
    const sync = makeStateSync();
    const handle = defineOverlay(
      { el, key: (s) => [s.v], render, validate: () => undefined },
      { _stateSync: sync.fn }
    );
    await handle.ready;
    sync.push({ v: 1 });
    expect(render).toHaveBeenCalledTimes(1);
  });

  // Contract 3: all deps settle before the first render; a rejecting dep yields
  // its fallback and never blocks registration.
  it('waits for deps to settle before wiring stateSync / rendering', async () => {
    const el = makeEl();
    const render = vi.fn();
    const sync = makeStateSync();
    let resolveDep;
    const dep = () => new Promise((r) => { resolveDep = r; });
    const handle = defineOverlay(
      { el, key: (s) => [s.v], render, deps: [dep] },
      { _stateSync: sync.fn }
    );
    // handle.ready cannot be awaited here — it only resolves once the dep does.
    // A single microtask lets any already-settled chain run; the dep is still
    // pending, so nothing should be wired yet.
    await Promise.resolve();
    expect(sync.fn).not.toHaveBeenCalled(); // deps still pending

    resolveDep([]);
    await handle.ready;
    expect(sync.fn).toHaveBeenCalledTimes(1); // wired after deps

    sync.push({ v: 1 });
    expect(render).toHaveBeenCalledTimes(1); // first post-deps frame renders
  });

  it('a rejecting dep falls back and still registers (hero-bans lesson)', async () => {
    const el = makeEl();
    const render = vi.fn();
    const sync = makeStateSync();
    const badDep = () => Promise.reject(new Error('network down'));
    const goodDep = () => Promise.resolve('ok');
    const handle = defineOverlay(
      { el, key: (s) => [s.v], render, deps: [badDep, goodDep] },
      { _stateSync: sync.fn }
    );
    await handle.ready;

    expect(sync.fn).toHaveBeenCalledTimes(1); // failure did not block registration
    sync.push({ v: 1 });
    expect(render).toHaveBeenCalledTimes(1);
  });

  // Contract 4: forceRender re-runs render with the last state even when the
  // key is unchanged (switchMap escape hatch); no-op before any state.
  it('forceRender re-renders last state even when key is unchanged', async () => {
    const el = makeEl();
    const render = vi.fn();
    const sync = makeStateSync();
    const handle = defineOverlay(
      { el, key: (s) => [s.v], render },
      { _stateSync: sync.fn }
    );
    await handle.ready;

    sync.push({ v: 1 });
    expect(render).toHaveBeenCalledTimes(1);

    handle.forceRender(); // same key, but forced
    expect(render).toHaveBeenCalledTimes(2);
    // render was called with the last seen state
    expect(render.mock.calls[1][0]).toEqual({ v: 1 });
  });

  it('forceRender before any state has arrived is a safe no-op', async () => {
    const el = makeEl();
    const render = vi.fn();
    const sync = makeStateSync();
    const handle = defineOverlay(
      { el, key: (s) => [s.v], render },
      { _stateSync: sync.fn }
    );
    await handle.ready;
    expect(() => handle.forceRender()).not.toThrow();
    expect(render).toHaveBeenCalledTimes(0);
  });

  // Contract 5: shell runs exactly once before the first render; render gets a
  // dedicated child container so its innerHTML rebuilds never touch the shell.
  it('runs shell exactly once, before the first render, across many renders', async () => {
    const el = makeEl();
    const shell = vi.fn();
    const render = vi.fn(() => {
      expect(shell).toHaveBeenCalledTimes(1); // shell ran before render
    });
    const sync = makeStateSync();
    const handle = defineOverlay(
      { el, key: (s) => [s.v], render, shell },
      { _stateSync: sync.fn }
    );
    await handle.ready;

    sync.push({ v: 1 });
    sync.push({ v: 2 });
    sync.push({ v: 3 });
    expect(shell).toHaveBeenCalledTimes(1);
    expect(shell.mock.calls[0][0]).toBe(el); // shell operates on the mount root
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('render receives a dedicated child container, not the shell root', async () => {
    const el = makeEl();
    const render = vi.fn((state, container) => {
      container.innerHTML = 'volatile-' + state.v;
    });
    const sync = makeStateSync();
    const handle = defineOverlay(
      { el, key: (s) => [s.v], render },
      { _stateSync: sync.fn }
    );
    await handle.ready;

    sync.push({ v: 1 });
    const container = render.mock.calls[0][1];
    expect(container).toBeTruthy();
    expect(container).not.toBe(el); // rebuilds target a child, not the root
    expect(el.children).toContain(container); // container was mounted under el
    expect(el.innerHTML).toBe(''); // shell root untouched by render's rebuild

    sync.push({ v: 2 });
    // same container reused for the next render (single volatile slot)
    expect(render.mock.calls[1][1]).toBe(container);
  });

  // Contract 6: defineOverlay integrates with stateSync itself.
  it('wires itself into stateSync exactly once', async () => {
    const el = makeEl();
    const sync = makeStateSync();
    const handle = defineOverlay(
      { el, key: (s) => [s.v], render: () => {} },
      { _stateSync: sync.fn }
    );
    await handle.ready;
    expect(sync.fn).toHaveBeenCalledTimes(1);
  });

  // Re-entrancy: a render that calls its own handle.forceRender() must render
  // once and NOT recurse to a stack overflow (guard for the 17-scene rollout).
  it('a render that calls forceRender does not recurse (re-entrancy guard)', async () => {
    const el = makeEl();
    let handle;
    const render = vi.fn(() => {
      handle.forceRender(); // re-entrant: must be ignored while rendering
    });
    const sync = makeStateSync();
    handle = defineOverlay(
      { el, key: (s) => [s.v], render },
      { _stateSync: sync.fn }
    );
    await handle.ready;

    expect(() => sync.push({ v: 1 })).not.toThrow();
    expect(render).toHaveBeenCalledTimes(1);
  });
});
