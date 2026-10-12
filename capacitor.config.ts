import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the statically exported Next.js build in a native Android
 * shell. `webDir` matches Next's `output: "export"` directory.
 */
const config: CapacitorConfig = {
  appId: "in.kiranatrack.app",
  appName: "KiranaTrack",
  webDir: "out",
  android: {
    // A POS terminal often runs on a shop owner's own data plan; nothing in this
    // app needs cleartext traffic, so it stays off.
    allowMixedContent: false,
  },
};

export default config;
