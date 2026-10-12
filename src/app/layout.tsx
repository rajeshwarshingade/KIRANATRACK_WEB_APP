import type { Metadata, Viewport } from "next";
import { Inter, Teko } from "next/font/google";
import type { ReactNode } from "react";

import { AppMark, AppNav } from "@/components/AppNav";
import { SettingsButton } from "@/components/SettingsButton";
import { StoreProvider } from "@/lib/store-context";
import { STUDIO } from "@/lib/studio";

import "./globals.css";

/**
 * Type system.
 *
 * Teko is a condensed display face: it carries headings, labels, stat values
 * and navigation at large sizes where its tight, architectural shapes read
 * well. It is deliberately NOT used for long paragraph copy — at 14–15px an
 * all-caps condensed face is measurably harder to read, which would work
 * against the calm, legible tone the rest of the interface needs.
 */
const display = Teko({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "KiranaTrack — Billing, Stock & Expiry for Your Kirana Store",
    template: "%s · KiranaTrack",
  },
  description:
    "A complete shop operating system for Indian kirana stores: GST billing, stock control, expiry tracking, and an advisor that reads your own numbers and tells you what to do next. Works offline, on your own device.",
  applicationName: "KiranaTrack",
  authors: [{ name: `${STUDIO.name} — ${STUDIO.owner.name}` }],
  creator: STUDIO.owner.name,
  publisher: STUDIO.owner.name,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "KiranaTrack",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#e3e9f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Layout props are typed explicitly rather than through Next's generated
 * `LayoutProps<"/">` global.
 *
 * That global only exists once a build has written `.next/types`, so depending
 * on it makes a clean checkout fail `tsc --noEmit` before anything has ever
 * been built. The shape is identical and nothing is lost.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="neu-btn neu-btn-primary sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]"
        >
          Skip to main content
        </a>

        {/*
          Fixed translucent top bar. It floats above the content, so the page
          container carries matching top padding to keep the first heading clear
          of it. Backdrop-filter means content scrolling underneath stays legible
          rather than being clipped by an opaque band.
        */}
        <header className="neu-glass no-print fixed inset-x-0 top-0 z-50 border-b border-shadow-dark/20">
          <div className="app-shell flex items-center justify-between gap-4 py-3">
            <AppMark />
            {/* Right cluster: the data badge (wide screens) then the gear.
                The gear sits outermost so it is always in the same corner. */}
            <div className="flex shrink-0 items-center gap-2.5">
              <p className="neu-capsule hidden lg:inline-flex">
                All data stays on this device
              </p>
              <SettingsButton />
            </div>
          </div>
        </header>

        {/* pt clears the fixed bar; pb clears the fixed dock. */}
        <StoreProvider>
          <div className="app-shell flex flex-1 gap-8 pb-32 pt-28 lg:pb-12">
            <AppNav />
            <main id="main" className="min-w-0 flex-1">
              {children}
            </main>
          </div>
        </StoreProvider>
      </body>
    </html>
  );
}
