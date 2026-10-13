"use client";

/**
 * First-launch welcome, and the update prompt.
 *
 * Both are one-time-ish moments that must not get in the way. The rules they
 * share:
 *
 *  - **They never block work.** A shop owner may be mid-bill. Both can be
 *    dismissed and the app carries on exactly as before.
 *  - **They never touch data.** Nothing here writes, migrates or clears
 *    anything. The owner may have a month of bills in this app, and an update
 *    notice that looked like it might lose them is a notice nobody reads.
 *  - **They never leave the app silent about failure.** A version check that
 *    cannot reach the network is not an error to report — it is the normal
 *    state of a shop on a bad connection.
 */

import { useEffect, useState } from "react";

import {
  AttributionFooter,
  PrivacyNote,
  StudioCard,
  appPageUrl,
} from "./Attribution";
import {
  AlertTriangle,
  Check,
  Clock,
  Download,
  Sparkle,
} from "./Icons";
import {
  APP_BLURB,
  APP_LABEL,
  APP_URL,
  APP_VERSION,
  APP_VERSION_CODE,
  STUDIO_URL,
} from "@/lib/app-info";
import {
  checkForUpdate,
  dismiss,
  isDismissed,
  type UpdateStatus,
} from "@/lib/update";
import { useHydrated, usePersistentState } from "@/lib/storage";

/* ==========================================================================
   Welcome — first launch only
   ========================================================================== */

const WELCOME_KEY = "welcome-seen";

export function WelcomePopup() {
  /*
   * Whether the welcome is up is *derived*, not set from an effect.
   *
   * `useHydrated` reports that React has swapped the server snapshot for the
   * real one, and `seen` is itself persisted state read through the same
   * external-store hook. So on the server and on the first client render both
   * are known, the markup matches, and the popup appears on the same paint —
   * with no effect and no second render pass.
   *
   * Reading localStorage during render would break hydration, which is why
   * `hydrated` gates it rather than the read itself.
   */
  const hydrated = useHydrated();
  const [seen, setSeen] = usePersistentState<boolean>(WELCOME_KEY, false);

  const open = hydrated && !seen;

  function close() {
    setSeen(true);
  }

  if (!open) return null;

  return (
    <Overlay onClose={close} labelledBy="welcome-title">
      <div className="flex flex-col items-center text-center">
        <span className="neu-well grid size-16 place-items-center text-brand">
          <Sparkle size={28} weight="bold" />
        </span>

        <h1 id="welcome-title" className="mt-5 text-2xl">
          Welcome to {APP_LABEL}
        </h1>
        <p className="mt-2 max-w-sm leading-relaxed text-ink-muted">
          {APP_BLURB} Version {APP_VERSION}.
        </p>
      </div>

      <div className="mt-6">
        <StudioCard />
      </div>

      <PrivacyNote>
        Your shop&apos;s records stay on this device. No account, no server, no
        tracking — and nothing is uploaded anywhere.
      </PrivacyNote>

      <button type="button" onClick={close} className="neu-btn neu-btn-primary mt-6 w-full">
        <Check size={18} weight="bold" /> Start using {APP_LABEL}
      </button>

      <p className="mt-3 text-center text-xs font-medium text-ink-faint">
        Shown once. Find this again under Settings.
      </p>
    </Overlay>
  );
}

/* ==========================================================================
   Update prompt
   ========================================================================== */

/**
 * Checks on launch, and shows nothing unless there is genuinely something newer.
 *
 * The check is deliberately not retried on an interval: a shop app should not
 * be polling the network all day. Launch is enough, because the common case is
 * "I opened the app after the new version went out".
 */
export function UpdatePrompt() {
  const [status, setStatus] = useState<UpdateStatus>({ state: "unknown" });

  useEffect(() => {
    let cancelled = false;

    void checkForUpdate(APP_VERSION, APP_VERSION_CODE).then((result) => {
      if (!cancelled) setStatus(result);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status.state !== "outdated" && status.state !== "unsupported") return null;
  if (isDismissed(status.entry.version)) return null;

  const { entry } = status;
  const unsupported = status.state === "unsupported";

  return (
    <Overlay onClose={() => dismiss(entry.version)} labelledBy="update-title">
      <div className="flex flex-col items-center text-center">
        <span
          className={`neu-well grid size-16 place-items-center ${
            unsupported ? "text-danger" : "text-brand"
          }`}
        >
          {unsupported ? (
            <AlertTriangle size={28} weight="bold" />
          ) : (
            <Download size={28} weight="bold" />
          )}
        </span>

        <h1 id="update-title" className="mt-5 text-2xl">
          {unsupported ? "This version is out of support" : `Version ${entry.version} is ready`}
        </h1>

        <p className="mt-2 max-w-sm leading-relaxed text-ink-muted">
          {unsupported
            ? `You are on ${APP_VERSION}. Updating keeps everything you have already recorded — nothing is reset and nothing is lost.`
            : `You are on ${APP_VERSION}. Updating keeps everything you have already recorded — nothing is reset and nothing is lost.`}
        </p>
      </div>

      {entry.notes && entry.notes.length > 0 && (
        <ul className="mt-5 space-y-2">
          {entry.notes.map((note) => (
            <li key={note} className="flex items-start gap-2.5">
              <Check size={15} className="mt-0.5 shrink-0 text-success" />
              <span className="text-sm font-medium leading-relaxed text-ink-muted">
                {note}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
        <a
          href={entry.download ?? entry.url}
          className="neu-btn neu-btn-primary flex-1"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Download size={18} weight="bold" /> Get the update
        </a>
        <button
          type="button"
          onClick={() => dismiss(entry.version)}
          className="neu-btn flex-1"
        >
          <Clock size={18} weight="bold" /> Not now
        </button>
      </div>

      <p className="mt-3 text-center text-xs font-medium leading-relaxed text-ink-faint">
        Dismissing hides this until the next release. Installing over the top of
        the existing app keeps your data.
      </p>

      <AttributionFooter className="mt-4" />
    </Overlay>
  );
}

/* ==========================================================================
   Shared overlay
   ========================================================================== */

/**
 * Full-screen modal shell.
 *
 * Deliberately its own component rather than the `Modal` in `ui.tsx`: that one
 * is sized and titled for editing a product, while these two are moments where
 * the app behind should be visible — a shop owner dismissing an update prompt
 * should be able to see their own screen and know nothing has changed.
 */
function Overlay({
  onClose,
  labelledBy,
  children,
}: {
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="no-print fixed inset-0 z-[90] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        // Backdrop click dismisses; a click inside the card must not bubble.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="neu-raised-lg w-full max-w-md p-6 sm:p-7"
      >
        {children}
      </div>
    </div>
  );
}

/** Exported for the Settings screen, which links both places. */
export const WELCOME_URL = APP_URL;
export { STUDIO_URL, appPageUrl };
