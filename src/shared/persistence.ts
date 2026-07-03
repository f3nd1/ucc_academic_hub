// Namespaced localStorage persistence, shared by every workspace tool.
//
// Each tool owns a slice of localStorage under an "ucc:<toolId>:" prefix so
// two trackers can never collide on a key (e.g. "ucc:timetable:state" vs
// "ucc:reviewPlanner:records"). Tools should build a small module of typed
// load/save helpers on top of these primitives rather than touch localStorage
// directly.

const ROOT = 'ucc';

/** The fully-qualified storage key for a tool's namespaced sub-key. */
export const namespacedKey = (toolId: string, key: string): string =>
  `${ROOT}:${toolId}:${key}`;

/** Read and JSON-parse a namespaced value, falling back on any failure. */
export function loadNamespaced<T>(toolId: string, key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(namespacedKey(toolId, key));
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** JSON-stringify and write a namespaced value; swallows quota/private-mode errors. */
export function saveNamespaced<T>(toolId: string, key: string, value: T): void {
  try {
    localStorage.setItem(namespacedKey(toolId, key), JSON.stringify(value));
  } catch {
    // Private mode / quota exceeded: the value stays in memory for the session.
  }
}

/** Remove a namespaced value (no-op if absent). */
export function removeNamespaced(toolId: string, key: string): void {
  try {
    localStorage.removeItem(namespacedKey(toolId, key));
  } catch {
    /* ignore */
  }
}
