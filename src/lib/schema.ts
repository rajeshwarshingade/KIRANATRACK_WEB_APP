/**
 * Storage schema versioning and migrations.
 *
 * An app update must never cost a shop its ledger. localStorage survives app
 * upgrades (it lives in the app's data directory, which Android preserves
 * across versionCode bumps), but a schema change would silently break anything
 * reading it. So every stored document carries a version and is passed through
 * a migration chain on read.
 *
 * Rules for adding a migration:
 *   1. Bump SCHEMA_VERSION.
 *   2. Add one entry to MIGRATIONS that takes `from` -> `from + 1`.
 *   3. Never mutate or drop a field a later migration still expects.
 *
 * A document from a *newer* app is left untouched rather than downgraded, so
 * downgrading an APK does not destroy a ledger written by a newer build.
 */

export const SCHEMA_VERSION = 1;

type Doc = Record<string, unknown>;

type Migration = (doc: Doc) => Doc;

/** from-version -> migration producing the next version. */
const MIGRATIONS: Record<number, Migration> = {};

/**
 * Bring a stored document up to the current schema.
 *
 * Tolerant by design: a missing, unparseable, or unknown-shape document yields
 * the supplied fallback rather than throwing, so a corrupt key can never
 * white-screen the app.
 */
export function migrate<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    // v0 stored bare arrays/values with no envelope.
    return parsed as T;
  }

  const envelope = parsed as Doc & { __v?: number };

  // No envelope => written before versioning existed. Treat as v1 so the v1 -> v2
  // chain still runs.
  const from = typeof envelope.__v === "number" ? envelope.__v : 1;

  if (from >= SCHEMA_VERSION) {
    const { __v, ...rest } = envelope;
    void __v;
    return rest as T;
  }

  let current: Doc = { ...envelope };
  let version = from;

  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break; // no path forward — return what we have
    current = step(current);
    version += 1;
  }

  const { __v, ...rest } = current;
  void __v;

  return rest as T;
}

/** Wrap a value with the current schema version before it is written. */
export function seal<T>(value: T): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    // Arrays and primitives keep their bare shape; collection shape is unchanged
    // between versions, so there is nothing to version.
    return JSON.stringify(value);
  }
  return JSON.stringify({ ...(value as Doc), __v: SCHEMA_VERSION });
}
