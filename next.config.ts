import type { NextConfig } from "next";

/**
 * The Android build loads a static bundle through Capacitor's WebView, so that
 * build needs `output: "export"`. It is gated behind CAPACITOR_BUILD rather
 * than enabled permanently — turning it on unconditionally removes the server
 * renderer and would change how `next dev` and a normal `next build` behave.
 */
const isAndroidBuild = process.env.CAPACITOR_BUILD === "1";

const nextConfig: NextConfig = {
  ...(isAndroidBuild
    ? {
        output: "export" as const,
        // No Next.js image optimisation server inside a WebView.
        images: { unoptimized: true },
        // Directory-style URLs so every route resolves from a static bundle.
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
