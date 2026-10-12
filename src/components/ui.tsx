"use client";

/**
 * Shared UI primitives.
 *
 * Built on the neumorphic token classes in `globals.css`. Every interactive
 * element here satisfies the accessibility rules that system documents: a
 * visible focus ring (the default outline is invisible on a soft-light
 * surface), a touch target at or above 44px for primary actions, and colour
 * never carrying meaning alone.
 */

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

import { Close, Inbox } from "./Icons";

/* ==========================================================================
   Page furniture
   ========================================================================== */

/** Page-level heading with an optional action on the right. */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    // The heading block is flex-1 so a long description shrinks instead of
    // pushing the action onto its own row. Below `sm` the action drops under
    // the heading and stays left-aligned with it.
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="neu-eyebrow">{eyebrow}</p>}
        <h1 className="mt-4 font-display text-3xl font-bold text-ink sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl leading-relaxed text-ink-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Standard raised neumorphic panel. */
export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li" | "form";
}) {
  return <Tag className={`neu-raised p-6 ${className}`}>{children}</Tag>;
}

/** Small label above a group of content. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-widest text-ink-muted">
      {children}
    </h2>
  );
}

/* ==========================================================================
   Stats
   ========================================================================== */

export type StatTone = "default" | "brand" | "success" | "notice" | "danger";

const TONE_CLASS: Record<StatTone, string> = {
  default: "text-ink",
  brand: "text-brand",
  success: "text-success",
  notice: "text-notice",
  danger: "text-danger",
};

const TONE_ICON: Record<StatTone, string> = {
  default: "text-ink-muted",
  brand: "text-brand",
  success: "text-success",
  notice: "text-notice",
  danger: "text-danger",
};

/**
 * Stat tile. `value` is supplied by the caller so it can render a dash until
 * storage has hydrated rather than flashing a misleading zero.
 *
 * `hint` carries the secondary line — the unit, or the comparison that makes the
 * number mean something. A bare rupee figure on a shop dashboard is unreadable
 * without it.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: StatTone;
}) {
  return (
    <div className="neu-inset flex items-center gap-4 px-5 py-4">
      {icon && (
        <span
          className={`neu-well grid size-11 shrink-0 place-items-center ${TONE_ICON[tone]}`}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-[0.7rem] font-bold uppercase tracking-wider text-ink-muted">
          {label}
        </p>
        <p className={`tabular mt-1 font-display text-xl font-bold ${TONE_CLASS[tone]}`}>
          {value}
        </p>
        {hint && (
          <p className="mt-0.5 truncate text-[0.7rem] font-medium text-ink-faint">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   Forms
   ========================================================================== */

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="neu-label">{label}</label>
      {children}
      {hint && (
        <p className="mt-1.5 text-xs font-medium leading-relaxed text-ink-faint">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Toggle switch.
 *
 * A real checkbox underneath, so it is reachable by keyboard, announced by
 * screen readers and submitted with forms, with the visual switch drawn on top.
 */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className={`relative inline-block h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-brand" : "bg-shadow-dark/40"
        }`}
        style={{
          boxShadow: checked
            ? "inset 2px 2px 5px rgba(11,22,64,0.45)"
            : "var(--shadow-inset-sm)",
        }}
      >
        <span
          className="absolute top-1 size-5 rounded-full bg-white transition-transform duration-200"
          style={{
            left: 4,
            transform: checked ? "translateX(20px)" : "none",
            boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
          }}
        />
      </span>
      <span className="text-sm font-semibold text-ink-muted">{label}</span>
    </label>
  );
}

/**
 * Segmented control.
 *
 * Used for filters where only one option applies. `role="radiogroup"` with real
 * radio semantics so arrow keys and screen readers behave, rather than a row of
 * buttons that only looks like one.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="neu-inset-sm inline-flex flex-wrap gap-1.5 p-1.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`neu-tab-label !min-h-0 !flex-row px-3.5 py-2 text-[0.8rem] transition-all duration-200 ${
              active ? "neu-tab-active" : "neu-tab-idle hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   Feedback
   ========================================================================== */

/**
 * Inline confirmation banner.
 *
 * `role="status"` rather than `role="alert"`: these follow user actions they
 * requested, and an assertive announcement interrupts whatever a screen reader
 * user is in the middle of.
 */
export function Notice({
  tone = "brand",
  children,
}: {
  tone?: "brand" | "success" | "warn" | "danger";
  children: ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warn"
        ? "text-notice"
        : tone === "danger"
          ? "text-danger"
          : "text-brand";

  return (
    <p role="status" className={`neu-inset px-4 py-3 text-sm font-semibold ${toneClass}`}>
      {children}
    </p>
  );
}

/**
 * Empty state.
 *
 * Every list in this app starts empty by design, so this is a primary screen
 * rather than a fallback. It names what is missing and offers the one action
 * that creates it, rather than showing a shrug.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="neu-inset flex flex-col items-center px-6 py-14 text-center">
      <span className="neu-well grid size-16 place-items-center text-brand">
        {icon ?? <Inbox size={30} />}
      </span>
      <h3 className="mt-6 font-display text-xl font-bold text-ink">{title}</h3>
      <p className="mt-2.5 max-w-sm leading-relaxed text-ink-muted">
        {description}
      </p>
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}

/**
 * Placeholder shown while persisted state is being adopted.
 *
 * Pages gate on `hydrated` to keep server and client markup identical. Without
 * a shaped skeleton that gap reads as a broken layout, so this mirrors the real
 * page rhythm — heading block, stat row, then a panel — rather than rendering
 * one empty spacer followed by floating cards.
 */
export function PageSkeleton({ stats = 4 }: { stats?: number }) {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your shop data…</span>

      {/* Heading block */}
      <div className="flex flex-col gap-3">
        <div className="neu-inset h-5 w-24" />
        <div className="neu-inset h-9 w-64 max-w-full" />
        <div className="neu-inset h-4 w-full max-w-md" />
      </div>

      {/* Stat row. Uses responsive classes rather than an inline
          grid-template-columns, which would force four narrow columns on a
          375px phone and clip the tile labels. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: stats }, (_, i) => (
          <div key={i} className="neu-raised h-24" />
        ))}
      </div>

      <div className="neu-raised h-72" />
    </div>
  );
}

/* ==========================================================================
   Modal
   ========================================================================== */

/**
 * Dialog.
 *
 * Three behaviours that a modal gets wrong by default, handled here once:
 *
 *  - **Escape closes it.** Nobody should have to hunt for a close button.
 *  - **Focus moves in on open and returns on close.** Otherwise keyboard focus
 *    stays behind the dialog, on a control the user can no longer see.
 *  - **Background scroll is locked.** Otherwise the page behind scrolls under a
 *    modal that looks stationary.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      // Trap focus inside the dialog. Without this, Tab walks out into the page
      // behind, which is invisible and disorienting.
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    // Lock the page behind the dialog.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first control, or the panel itself if it has none.
    const timer = setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)',
      );
      (target ?? panelRef.current)?.focus();
    }, 40);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      clearTimeout(timer);
      restoreTo.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-[100] flex items-end justify-center bg-ink/35 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      // Clicking the backdrop closes; clicking the panel must not bubble here,
      // hence the stopPropagation on the panel below.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`neu-raised-lg flex max-h-[92vh] w-full flex-col overflow-hidden rounded-b-none sm:rounded-b-[1.5rem] ${
          wide ? "sm:max-w-3xl" : "sm:max-w-xl"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-shadow-dark/20 px-6 py-4">
          <h2 id={titleId} className="font-display text-lg font-bold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="neu-btn neu-btn-sm !min-h-0 !p-2"
          >
            <Close size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-shadow-dark/20 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Confirmation dialog for anything destructive.
 *
 * The copy names the consequence in the owner's terms — what is lost and whether
 * it can be recovered — because a generic "Are you sure?" does not let anyone
 * make an informed choice.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  destructive,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="neu-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`neu-btn ${destructive ? "neu-btn-danger" : "neu-btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="leading-relaxed text-ink-muted">{body}</p>
    </Modal>
  );
}

/* ==========================================================================
   Small parts
   ========================================================================== */

/** Icon button sized for a table row, not a full `.neu-btn`. */
export function IconButton({
  label,
  onClick,
  children,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`neu-btn neu-btn-sm !min-h-0 !p-2 ${
        tone === "danger" ? "hover:!text-danger" : ""
      }`}
    >
      {children}
    </button>
  );
}

/** Horizontal meter. Used for stock-vs-reorder and margin readouts. */
export function Meter({
  value,
  max,
  tone = "brand",
  label,
}: {
  value: number;
  max: number;
  tone?: "brand" | "success" | "notice" | "danger";
  label: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  const fill =
    tone === "success"
      ? "bg-success"
      : tone === "notice"
        ? "bg-notice"
        : tone === "danger"
          ? "bg-danger"
          : "bg-brand";

  return (
    <div
      className="neu-inset-sm h-2.5 w-full overflow-hidden rounded-full p-0.5"
      role="meter"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full ${fill}`}
        style={{ width: `${pct}%`, transition: "width 600ms var(--ease-soft)" }}
      />
    </div>
  );
}
