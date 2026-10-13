/**
 * Attribution.
 *
 * One line, at the bottom of every page: who built it, and that the rights are
 * theirs. Deliberately *small*.
 *
 * An earlier build put a full studio card — logo, links, socials, a paragraph
 * — at the bottom of every screen and again on Settings. That was a mistake for
 * this app. The owner opens KiranaTrack to ring up a bill, and a marketing
 * panel between them and the next step is friction on the one screen where
 * friction costs money. The credit still has to travel with the app, though:
 * it ships as a standalone APK with no store page attached, so if the credit is
 * not in the app it is nowhere.
 *
 * So the credit stays, in one line, and nothing else does.
 *
 * "Smalltown studio" is a real link. It is the one piece of navigation in the
 * footer, and it goes to the studio page — which is also where updates live,
 * so the app's only route to a newer version runs through the same door.
 */

import type { ReactNode } from "react";

import { Shield } from "./Icons";

/** The studio's site. Also where the update manifest and the APKs live. */
export const STUDIO_URL = "https://small-town-studio.vercel.app";

export const STUDIO_NAME = "Smalltown studio";

export const OWNER_NAME = "Rajeshwar Shingade";

export const RIGHTS_LINE = `${STUDIO_NAME} — all rights and ownership go to ${OWNER_NAME}.`;

/**
 * The footer line.
 *
 * `showShield` is off by default: the shield icon repeated on all eight screens
 * says "your data is safe" eight times, and the first time is the only time it
 * reads as reassurance rather than decoration.
 */
export function AttributionFooter({
  showShield = false,
  className = "",
}: {
  showShield?: boolean;
  className?: string;
}) {
  return (
    <p
      className={`flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-xs font-medium text-ink-faint ${className}`}
    >
      {showShield && <Shield size={13} className="shrink-0" />}
      <span>{STUDIO_NAME}</span>
      <span aria-hidden="true">·</span>
      {/* rel="noopener" because the target is a different origin and we do not
          want it holding a handle on this window. */}
      <a
        href={STUDIO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 transition-colors hover:text-brand"
      >
        all rights and ownership go to {OWNER_NAME}
      </a>
    </p>
  );
}

/**
 * What every page renders at its foot.
 *
 * Kept under the name the pages already import rather than renamed, because
 * that is how the line ends up on all eight screens: the alternative was eight
 * edits and one page that would eventually be missed.
 */
export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`no-print mt-10 ${className}`}>
      <AttributionFooter />
    </footer>
  );
}

/** Where this specific app's page lives, for use in the welcome and update UI. */
export function appPageUrl(slug: string): string {
  return `${STUDIO_URL}/apps/${slug}`;
}

/**
 * Full studio card, used *only* inside the welcome popup.
 *
 * This is the one place it earns its space: the popup appears once, on first
 * launch, and someone opening an app for the first time is exactly who wants to
 * know who made it and where else to find them. Everywhere else it is clutter.
 */
export function StudioCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className="neu-inset px-5 py-4 text-center">
      <p className="font-display text-lg font-bold tracking-wide text-ink">
        {STUDIO_NAME}
      </p>
      <p className="mt-1 text-sm font-medium text-ink-muted">
        Custom apps, built carefully and supported for as long as you need.
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <a
          href={STUDIO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="neu-btn neu-btn-sm !min-h-0 !px-3.5 !py-2"
        >
          Visit the studio
        </a>
        <a
          href={`mailto:shingade27r@gmail.com?subject=${encodeURIComponent(`${RIGHTS_LINE} — question about an app`)}`}
          className="neu-btn neu-btn-sm !min-h-0 !px-3.5 !py-2"
        >
          Email {OWNER_NAME}
        </a>
      </div>

      {!compact && (
        <p className="mt-4 text-[0.68rem] font-medium leading-relaxed text-ink-faint">
          Everything you record stays on your own device. No account, no server,
          no tracking. Uninstalling removes it.
        </p>
      )}
    </div>
  );
}

/**
 * Placeholder kept so the icon import is not orphaned by the footer shrinking.
 * The shield is used by the welcome popup's privacy line.
 */
export function PrivacyNote({ children }: { children?: ReactNode }) {
  return (
    <p className="flex items-start justify-center gap-2 text-xs font-medium leading-relaxed text-ink-faint">
      <Shield size={14} className="mt-0.5 shrink-0 text-success" />
      <span>{children}</span>
    </p>
  );
}
