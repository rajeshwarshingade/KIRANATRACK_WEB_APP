import type { MetadataRoute } from "next";

import { STUDIO } from "@/lib/studio";

/**
 * Pinned as static.
 *
 * The Android build exports the whole app to a static bundle with
 * `output: "export"`, which refuses to prerender a route that has not declared
 * itself static. Without this the web build succeeds and the APK build fails at
 * the manifest — the one route a PWA install depends on.
 */
export const dynamic = "force-static";

/**
 * PWA manifest.
 *
 * Makes the app installable from a browser on a shop counter phone, which is
 * how most owners will actually run it before they sideload the APK.
 *
 * `start_url` is the dashboard rather than the billing screen: an owner opening
 * the app wants to see the state of the shop, and Billing is one tap from
 * there.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `KiranaTrack — ${STUDIO.attribution}`,
    short_name: "KiranaTrack",
    description:
      "GST billing, stock control and expiry tracking for an Indian kirana store. Your data stays on this device.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#e3e9f2",
    theme_color: "#e3e9f2",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
