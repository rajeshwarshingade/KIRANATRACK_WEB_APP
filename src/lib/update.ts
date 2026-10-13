/**
 * Update checking.
 *
 * The studio publishes one small JSON file listing what the latest version of
 * each app is. The app fetches it, compares against its own build, and — only
 * if it is genuinely behind — tells the owner.
 *
 * Design decisions that follow from who this is for:
 *
 *  - **It never blocks.** The owner may be mid-bill with a customer waiting.
 *    The prompt is a dialog they can dismiss and keep working through. An app
 *    that refuses to run because an update exists is worse than an app one
 *    version behind.
 *
 *  - **It never touches the data.** Data lives in localStorage under the app's
 *    own package, and an Android update replaces the APK without touching it.
 *    Nothing here writes, migrates or clears anything — the single most
 *    important property of an update path for a tool holding a shop's ledger.
 *
 *  - **A failed check is silent.** No connection, a slow shop connection, a
 *    DNS failure: all of them mean "no news", not "something is wrong". An
 *    error dialog about connectivity on a billing screen would be alarming and
 *    meaningless.
 *
 *  - **Dismissal is remembered per version.** Someone who says "not now" at
 *    09:00 should not be asked again at 09:05, but should be asked about 1.1.0
 *    later once they have seen 1.0.9.
 */

import { APP_VERSION, compareVersions } from "./app-info";

/** One app's entry, as published by the studio. */
export interface ManifestEntry {
  version: string;
  versionCode: number;
  url: string;
  download?: string;
  /** Shown when this release drops support for the running version. */
  minSupported?: string;
  notes?: string[];
}

export interface UpdateManifest {
  updatedAt?: string;
  apps: Record<string, ManifestEntry>;
}

/** Where the studio publishes it. */
const MANIFEST_URL =
  "https://small-town-studio.vercel.app/apps/updates.json";

/** This app's key within the manifest. */
const APP_KEY = "kiranatrack";

/** How long to wait before giving up on a shop's connection. */
const TIMEOUT_MS = 6000;

/** Key for the version the owner dismissed. */
const DISMISSED_KEY = "kiranatrack:update-dismissed-version";

export type UpdateStatus =
  | { state: "current" }
  | { state: "outdated"; entry: ManifestEntry }
  /**
   * The running version is below `minSupported` — old enough that it may hold
   * data a newer release cannot read. Same UI, different urgency.
   */
  | { state: "unsupported"; entry: ManifestEntry }
  | { state: "unknown" };

/**
 * Compare the published manifest against this build.
 *
 * Pure, so the decision can be tested without a network or a browser.
 */
export function evaluate(
  manifest: UpdateManifest,
  current: string,
  currentCode: number,
  key: string = APP_KEY,
): UpdateStatus {
  const entry = manifest?.apps?.[key];
  if (!entry || typeof entry.version !== "string") return { state: "unknown" };

  // versionCode is the authority when both sides have one: it is monotonic and
  // cannot be misread the way a dotted string can ("1.10" vs "1.9" sorts
  // wrong as text). The string comparison is the fallback for a manifest that
  // omits it.
  const behind =
    typeof entry.versionCode === "number"
      ? entry.versionCode > currentCode
      : compareVersions(entry.version, current) > 0;

  if (!behind) return { state: "current" };

  const unsupported =
    typeof entry.minSupported === "string" &&
    compareVersions(current, entry.minSupported) < 0;

  return unsupported
    ? { state: "unsupported", entry }
    : { state: "outdated", entry };
}

/** The version the owner dismissed, or null. */
function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function rememberDismissed(version: string) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, version);
  } catch {
    /* storage unavailable — the prompt reappears, which is survivable */
  }
}

/**
 * Check for an update.
 *
 * Resolves to `"unknown"` on every failure path. It never rejects, and never
 * throws: a caller should not need a try/catch to ask a question whose failure
 * is entirely uninteresting.
 */
export async function checkForUpdate(
  current: string,
  currentCode: number,
): Promise<UpdateStatus> {
  if (typeof window === "undefined") return { state: "unknown" };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(MANIFEST_URL, {
      signal: controller.signal,
      // The manifest changes when a release does, and a stale cached copy would
      // mean a released update that nobody is told about.
      cache: "no-store",
    });

    if (!response.ok) return { state: "unknown" };

    const manifest = (await response.json()) as UpdateManifest;
    return evaluate(manifest, current, currentCode);
  } catch {
    // Offline, DNS failure, malformed JSON, CORS. All mean the same thing here.
    return { state: "unknown" };
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Whether this version's prompt has already been dismissed. */
export function isDismissed(version: string): boolean {
  return readDismissed() === version;
}

/** Dismiss a version, so it is not offered again until the next release. */
export function dismiss(version: string): void {
  rememberDismissed(version);
}

/** Clear a dismissal — used by the "check for updates" button in Settings. */
export function clearDismissed(): void {
  try {
    window.localStorage.removeItem(DISMISSED_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** The version this build is, for display. */
export const CURRENT_VERSION = APP_VERSION;
