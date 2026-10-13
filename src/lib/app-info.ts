/**
 * Build identity for the running app.
 *
 * The web bundle cannot read Android's manifest, so the version is declared
 * here and kept in step with `android/app/build.gradle` by hand.
 *
 * That duplication is deliberate but not free, so it is worth saying plainly:
 * these two numbers must be updated together with `android/app/build.gradle`.
 * There is no automated check, because a web bundle cannot read a file on the
 * device and fetching the Gradle file at runtime is not possible. Adding a
 * codegen step would create a third thing that can be stale, which is worse
 * than two that are obvious.
 */

/** Human-readable version, shown in the header and Settings. */
export const APP_VERSION = "1.1.0";

/**
 * Android `versionCode`.
 *
 * Must strictly increase on every release. Android refuses to install an
 * update whose code has not gone up, so this is the number that decides
 * whether users can actually receive the update.
 */
export const APP_VERSION_CODE = 3;

/** Shown in the welcome popup and Settings. */
export const APP_LABEL = "KiranaTrack";

/** What this build is. Used in the update prompt and the welcome message. */
export const APP_BLURB =
  "GST billing, stock control and expiry tracking for a kirana store.";

/** Where an update, or the studio itself, lives. */
export const STUDIO_URL = "https://small-town-studio.vercel.app";

/** This app's page on the studio site. */
export const APP_URL = `${STUDIO_URL}/apps/kiranatrack`;

/**
 * Version comparison.
 *
 * Semantic-ish, but deliberately not a full semver implementation: an app
 * version is three dot-separated numbers, and pulling in a parser for that is
 * more surface than the problem needs. A leading "v" is tolerated because it is
 * a very easy thing to type into a manifest by hand.
 *
 * Returns a negative number when `a` is older, 0 when equal, positive when
 * newer.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    value
      .trim()
      .replace(/^v/i, "")
      .split(".")
      .map((part) => {
        const value = Number.parseInt(part, 10);
        return Number.isFinite(value) ? value : 0;
      });

  const left = parse(a);
  const right = parse(b);

  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}
