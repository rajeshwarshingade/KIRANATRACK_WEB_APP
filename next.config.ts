import type { NextConfig } from "next";

/**
 * Two build targets from one source tree.
 *
 * **Development and web** — neither variable is set, so this is an ordinary
 * Next.js application. That is what Vercel deploys, and what `next dev` runs.
 *
 * **Android** — the Capacitor WebView loads a static bundle from the filesystem
 * with no server behind it, so `CAPACITOR_BUILD=1` switches on
 * `output: "export"` with directory-style URLs.
 *
 * The Android flag is gated rather than permanent. Turning export on
 * unconditionally removes the server renderer, which would change how
 * `next dev` and a normal `next build` behave — and the web deployment is a
 * server build, so it must not inherit the WebView's constraints.
 */
const isAndroidBuild = process.env.CAPACITOR_BUILD === "1";

const nextConfig: NextConfig = {
  ...(isAndroidBuild
    ? {
        output: "export" as const,
        // No Next.js image optimisation server inside a WebView.
        images: { unoptimized: true },
        // Directory-style URLs so every route resolves from static files.
        trailingSlash: true,
      }
    : {}),

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
