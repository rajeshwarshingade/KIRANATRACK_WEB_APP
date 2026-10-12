/**
 * localStorage-backed state shared across every screen.
 *
 * Built on `useSyncExternalStore`, because localStorage *is* an external store:
 * it changes outside React (another tab, the browser's own persistence), and it
 * must not be read during render. The alternative — read it in a `useEffect` and
 * call `setState` — is the pattern this replaces, and it has three real costs:
 * it forces a second render pass on every mount, it re-implements by hand the
 * subscription `useSyncExternalStore` already provides, and it cannot express
 * "show the server value during hydration, the real value after" without an
 * ad-hoc `hydrated` flag threaded through every caller.
 *
 * `useSyncExternalStore` expresses exactly that: `getServerSnapshot` runs during
 * SSR and the hydration render, `getSnapshot` runs afterwards, and React
 * handles the switch. Server and client markup match on the first paint, and
 * the stored value appears without a flash of empty state.
 *
 * A corrupt or hand-edited value must never white-screen the app, so reads run
 * through the migration chain and fall back rather than throwing.
 */

"use client";

import { useCallback, useSyncExternalStore } from "react";

import { migrate, seal } from "./schema";

const PREFIX = "kiranatrack:";

/* ==========================================================================
   The external store
   ========================================================================== */

/** Subscribers per storage key. */
const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

/**
 * Parse cache.
 *
 * `getSnapshot` must return a referentially stable value for unchanged data or
 * React loops forever re-rendering. `JSON.parse` returns a fresh object every
 * call, so the parsed result is memoised against the exact string it came from.
 * When the string changes — a write, or another tab — the cache misses and
 * re-parses.
 */
const parseCache = new Map<string, { raw: string | null; value: unknown }>();

function readSnapshot<T>(key: string, fallback: T): T {
  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // Storage blocked (private mode, restricted WebView). Treated as empty,
    // so the app runs in memory rather than failing to start.
    return fallback;
  }

  const cached = parseCache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;

  const value = migrate<T>(raw, fallback);
  parseCache.set(key, { raw, value });
  return value;
}

/** Subscribe to writes from this tab and from other tabs. */
function subscribe(key: string, onChange: () => void): () => void {
  const set = listeners.get(key) ?? new Set<() => void>();
  set.add(onChange);
  listeners.set(key, set);

  // Another tab edited the same key. `storage` fires only in *other* tabs, so
  // this composes with the local emitter above rather than duplicating it.
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) onChange();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    set.delete(onChange);
    if (set.size === 0) listeners.delete(key);
    window.removeEventListener("storage", onStorage);
  };
}

/* ==========================================================================
   Persistence capability
   ========================================================================== */

/**
 * Whether the browser will actually persist writes.
 *
 * Cached in a module variable so the probe runs at most once per page load: it
 * writes and removes a key, and it is called from render. Safari in private mode
 * and some embedded WebViews expose `localStorage` but throw on write; storage
 * degrades to in-memory there and the UI warns the owner before they trust the
 * app with a day's takings.
 */
let storageOk: boolean | null = null;

export function storageAvailable(): boolean {
  if (storageOk !== null) return storageOk;

  try {
    const probe = `${PREFIX}probe`;
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    storageOk = true;
  } catch {
    storageOk = false;
  }

  return storageOk;
}

/**
 * True once the client has taken over from the server render.
 *
 * `useSyncExternalStore` gives exactly this for free: the server snapshot and
 * the first hydration render both return `false`, and React flips it to `true`
 * on the first client-only pass. Calling it as its own hook keeps every caller
 * from re-deriving the same two-argument pattern.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/* ==========================================================================
   The hook
   ========================================================================== */

export function usePersistentState<T>(
  key: string,
  initial: T,
): readonly [T, (next: T | ((prev: T) => T)) => void] {
  const storageKey = PREFIX + key;

  /*
   * `initial` is read inside both snapshot callbacks, so it must be stable
   * across renders. Callers pass either a module constant or a literal, and the
   * dependency arrays below keep the subscription stable; a caller that built
   * `initial` fresh every render would resubscribe on every render.
   */
  const subscribeKey = useCallback(
    (onChange: () => void) => subscribe(storageKey, onChange),
    [storageKey],
  );

  const getSnapshot = useCallback(() => readSnapshot<T>(storageKey, initial), [
    storageKey,
    initial,
  ]);

  const getServerSnapshot = useCallback(() => initial, [initial]);

  const value = useSyncExternalStore(subscribeKey, getSnapshot, getServerSnapshot);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      // The updater is resolved here, against the snapshot, rather than inside a
      // React state setter. Functional updates must stay pure — running one
      // during the render phase and notifying subscribers from inside it asks
      // them to re-render mid-render, which React rejects outright.
      const resolved =
        typeof next === "function" ? (next as (p: T) => T)(value) : next;

      try {
        window.localStorage.setItem(storageKey, seal(resolved));
        parseCache.delete(storageKey);
        emit(storageKey);
      } catch {
        // Quota exceeded or storage blocked — memory still updates, and the UI
        // warns via `storageAvailable()` that this data will not survive.
      }
    },
    [storageKey, value],
  );

  return [value, update] as const;
}

/** Ids that are unique enough for local records without pulling in a uuid lib. */
export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readKey<T>(key: string, fallback: T): T {
  try {
    return migrate<T>(window.localStorage.getItem(PREFIX + key), fallback);
  } catch {
    return fallback;
  }
}

export function writeKey<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(PREFIX + key, seal(value));
    parseCache.delete(PREFIX + key);
    emit(PREFIX + key);
  } catch {
    /* storage unavailable */
  }
}

/** Wipes every KiranaTrack key. Backs "erase all shop data" in Settings. */
export function clearAllData(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => {
      window.localStorage.removeItem(key);
      parseCache.delete(key);
      listeners.get(key)?.forEach((fn) => fn());
    });
  } catch {
    /* storage unavailable */
  }
}

/** Approximate footprint of stored data, shown in Settings. */
export function storageFootprint(): { bytes: number; keys: number } {
  let bytes = 0;
  let keys = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      keys += 1;
      // A UTF-16 code unit is 2 bytes in the storage estimate; close enough for
      // a "how much space am I using" readout, and avoids decoding every value.
      bytes += (key.length + (window.localStorage.getItem(key)?.length ?? 0)) * 2;
    }
  } catch {
    /* storage unavailable */
  }
  return { bytes, keys };
}

/** Total bytes in use, formatted for display. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
