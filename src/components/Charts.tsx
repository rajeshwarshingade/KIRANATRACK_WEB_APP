"use client";

/**
 * Charts.
 *
 * Every chart here is composed from the same neumorphic primitives as the rest
 * of the interface: bars sit in inset wells and fill with the brand colour,
 * rather than floating on a white card with a hard border. There is no charting
 * library — every chart here is CSS or inline SVG, which keeps the whole bundle
 * small enough to sideload as an APK and removes a dependency that would have
 * to agree with the design system rather than inheriting it.
 *
 * Two conventions run through all of them:
 *
 *  - **Bars grow on mount.** A chart that renders already-full looks static and
 *    gives no sense of proportion. The animation is transform/width driven with
 *    a short delay per row, so a tall stack reads top-down.
 *
 *  - **Colour never carries meaning alone.** Every status colour is paired with
 *    a text label or an icon, because this is a shop's stock health and a
 *    colourblind owner cannot act on "the red ones".
 */

import { useEffect, useState, type ReactNode } from "react";

import { formatMoneyCompact } from "@/lib/money";

/** Wait one frame, then flip to the real value so the transition is seen. */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return mounted;
}

/* ==========================================================================
   Donut — stock health
   ========================================================================== */

export interface DonutSlice {
  label: string;
  value: number;
  /** Tailwind fill class. */
  color: string;
}

export function Donut({
  slices,
  centerLabel,
  centerSub,
  emptyLabel = "Nothing to chart yet.",
}: {
  slices: DonutSlice[];
  centerLabel: string;
  centerSub?: string;
  emptyLabel?: string;
}) {
  const mounted = useMounted();
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return (
      <p className="neu-inset px-4 py-10 text-center text-sm font-medium text-ink-muted">
        {emptyLabel}
      </p>
    );
  }

  // 2πr with r=15.5 in a 40-unit viewBox, so each slice is a dash length.
  const circumference = 2 * Math.PI * 15.5;

  /*
   * Offsets are accumulated in a pure pass before the render, rather than
   * advanced with `offset += length` inside the map callback.
   *
   * Mutating a variable while walking JSX means the value depends on how far
   * the loop got, which breaks under React's concurrent re-render and under
   * StrictMode's double invocation. A `reduce` produces the same offsets with
   * no shared mutable state.
   */
  const segments = slices.reduce<
    { label: string; value: number; color: string; dash: string; offset: number }[]
  >((acc, slice) => {
    const runningTotal = acc.reduce((sum, entry) => sum + entry.value, 0);
    const fraction = total === 0 ? 0 : slice.value / total;
    const length = fraction * circumference;
    // A 2-unit gap between segments, so adjacent same-colour slices do not
    // visually merge into one longer bar. Only applied to non-zero slices —
    // a zero-length slice needs no dash at all.
    const gap = slice.value > 0 ? 2 : 0;
    const dashLength = Math.max(0, length - gap);

    acc.push({
      label: slice.label,
      value: slice.value,
      color: slice.color,
      dash: `${dashLength} ${circumference - dashLength}`,
      offset: -runningTotal,
    });
    return acc;
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative size-36 shrink-0">
        <svg viewBox="0 0 40 40" className="size-36 -rotate-90">
          <circle
            cx="20"
            cy="20"
            r="15.5"
            fill="none"
            stroke="var(--color-surface-deep)"
            strokeWidth="5"
          />
          {segments.map((segment) => (
            <circle
              key={segment.label}
              cx="20"
              cy="20"
              r="15.5"
              fill="none"
              stroke={CURRENT_COLOR[segment.color] ?? segment.color}
              strokeWidth="5"
              strokeDasharray={segment.dash}
              strokeDashoffset={segment.offset}
              style={{
                transition: mounted ? "stroke-dasharray 800ms var(--ease-soft)" : "none",
              }}
            />
          ))}
        </svg>

        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="tabular font-display text-2xl font-bold leading-none text-ink">
              {centerLabel}
            </p>
            {centerSub && (
              <p className="mt-1 text-[0.6rem] font-bold uppercase tracking-widest text-ink-faint">
                {centerSub}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Legend. The label is the accessible name; the dot is decoration. */}
      <ul className="min-w-32 flex-1 space-y-2.5">
        {slices
          .filter((slice) => slice.value > 0)
          .map((slice) => (
            <li key={slice.label} className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={`size-2.5 shrink-0 rounded-full ${slice.color}`}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-muted">
                {slice.label}
              </span>
              <span className="tabular shrink-0 text-sm font-bold text-ink">
                {slice.value}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}

/**
 * Resolve a Tailwind class to a real colour for SVG attributes.
 *
 * `stroke="bg-success"` is not a colour. SVG needs a computed value, and a
 * `currentColor` chain through the legend dots would couple the chart to DOM
 * order. This is the explicit mapping the chart owns.
 */
const CURRENT_COLOR: Record<string, string> = {
  "bg-success": "#15803d",
  "bg-notice": "#b45309",
  "bg-urgent": "#c2410c",
  "bg-danger": "#b91c1c",
  "bg-brand": "#1e40af",
  "bg-shadow-dark": "#a3b1c6",
};

/* ==========================================================================
   Horizontal bars — revenue by category, top products
   ========================================================================== */

export function HorizontalBars({
  items,
  emptyLabel,
  onSelect,
  format = formatMoneyCompact,
}: {
  items: { label: string; value: number; sub?: string }[];
  emptyLabel: string;
  onSelect?: (label: string) => void;
  format?: (value: number) => string;
}) {
  const mounted = useMounted();

  if (items.length === 0) {
    return (
      <p className="neu-inset px-4 py-10 text-center text-sm font-medium text-ink-muted">
        {emptyLabel}
      </p>
    );
  }

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className="space-y-3.5">
      {items.map((item, index) => {
        const pct = (item.value / max) * 100;
        const clickable = Boolean(onSelect);

        return (
          <li key={item.label}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onSelect?.(item.label)}
              className={`neu-chart-label w-full text-left ${
                clickable ? "cursor-pointer" : "cursor-default"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="neu-chart-label truncate text-sm font-semibold text-ink">
                  {item.label}
                </span>
                <span className="tabular neu-chart-label shrink-0 text-sm font-bold text-brand">
                  {item.sub ?? format(item.value)}
                </span>
              </div>
              <div className="neu-inset mt-1.5 h-3 w-full overflow-hidden rounded-full p-0.5">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{
                    width: mounted ? `${pct}%` : "0%",
                    transition: `width 600ms var(--ease-soft) ${index * 60}ms`,
                  }}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ==========================================================================
   Columns — daily and monthly revenue
   ========================================================================== */

export function ColumnChart({
  buckets,
  emptyLabel,
  onSelect,
  format = formatMoneyCompact,
  heightClass = "h-32",
}: {
  buckets: { key: string; value: number; label: string }[];
  emptyLabel: string;
  onSelect?: (key: string) => void;
  format?: (value: number) => string;
  heightClass?: string;
}) {
  const mounted = useMounted();

  if (buckets.length === 0) {
    return (
      <p className="neu-inset px-4 py-10 text-center text-sm font-medium text-ink-muted">
        {emptyLabel}
      </p>
    );
  }

  const max = Math.max(...buckets.map((b) => b.value), 1);

  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
      {buckets.map((bucket) => {
        const pct = (bucket.value / max) * 100;
        const clickable = Boolean(onSelect);

        return (
          <button
            key={bucket.key}
            type="button"
            disabled={!clickable}
            onClick={() => onSelect?.(bucket.key)}
            className={`neu-chart-label group flex min-w-11 flex-1 flex-col items-center gap-2 ${
              clickable ? "cursor-pointer" : "cursor-default"
            }`}
            aria-label={`${bucket.label}: ${format(bucket.value)}`}
          >
            {/* Value appears on hover/focus rather than permanently — with 30
                columns, permanent labels collide and none of them are readable. */}
            <span className="tabular neu-chart-label h-4 text-[0.65rem] font-bold text-brand opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
              {bucket.value === 0 ? "" : format(bucket.value)}
            </span>
            <span className={`neu-inset flex w-full items-end overflow-hidden rounded-xl p-1 ${heightClass}`}>
              <span
                className="w-full rounded-lg bg-brand"
                style={{
                  // A 3% floor keeps an empty day visible as "there was a day
                  // here and nothing sold", rather than as a gap in the axis.
                  height: mounted ? `${Math.max(pct, 3)}%` : "3%",
                  transition: "height 600ms var(--ease-soft)",
                }}
              />
            </span>
            <span className="neu-chart-label text-[0.65rem] font-semibold text-ink-muted">
              {bucket.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   Sparkline — a compact trend for a stat tile
   ========================================================================== */

export function Sparkline({
  values,
  tone = "brand",
  height = 40,
}: {
  values: number[];
  tone?: "brand" | "success" | "danger";
  height?: number;
}) {
  const mounted = useMounted();

  if (values.length < 2) return null;

  const max = Math.max(...values, 1);
  const stroke =
    tone === "success" ? "#15803d" : tone === "danger" ? "#b91c1c" : "#1e40af";

  // viewBox is wider than tall so the path has resolution; it scales to fit.
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 30 - (value / max) * 28;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${line} L100,32 L0,32 Z`;

  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      style={{ height }}
      className="w-full overflow-visible"
      aria-hidden="true"
    >
      <path d={area} fill={stroke} opacity="0.12" />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{
          // `stroke-dasharray` animation rather than a path-length animation:
          // it runs on the compositor and needs no layout.
          strokeDasharray: 200,
          strokeDashoffset: mounted ? 0 : 200,
          transition: "stroke-dashoffset 900ms var(--ease-soft)",
        }}
      />
    </svg>
  );
}

/* ==========================================================================
   Expiry timeline — the next 30 days at a glance
   ========================================================================== */

export function ExpiryTimeline({
  buckets,
  onSelect,
}: {
  buckets: { productId: string; name: string; qty: number; daysLeft: number; value: number }[];
  onSelect?: (productId: string) => void;
}) {
  const mounted = useMounted();

  if (buckets.length === 0) {
    return (
      <p className="neu-inset px-4 py-10 text-center text-sm font-medium text-ink-muted">
        Nothing is expiring in the next 30 days.
      </p>
    );
  }

  const maxQty = Math.max(...buckets.map((b) => b.qty), 1);

  return (
    <ul className="space-y-2.5">
      {buckets.map((bucket, index) => {
        const pct = (bucket.qty / maxQty) * 100;
        // Bar colour tracks urgency, and the day count beside it repeats the
        // same information in words.
        const tone =
          bucket.daysLeft < 0
            ? "bg-danger"
            : bucket.daysLeft <= 3
              ? "bg-urgent"
              : "bg-notice";

        const bar = (
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 truncate text-left text-sm font-semibold text-ink">
              {bucket.name}
            </span>
            <span className="neu-inset h-3 flex-1 overflow-hidden rounded-full p-0.5">
              <span
                className={`block h-full rounded-full ${tone}`}
                style={{
                  width: mounted ? `${pct}%` : "0%",
                  transition: `width 600ms var(--ease-soft) ${index * 50}ms`,
                }}
              />
            </span>
            <span className="tabular w-14 shrink-0 text-right text-xs font-bold text-ink-muted">
              {bucket.daysLeft < 0
                ? `${Math.abs(bucket.daysLeft)}d late`
                : `${bucket.daysLeft}d`}
            </span>
          </div>
        );

        return (
          <li key={bucket.productId}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(bucket.productId)}
                className="neu-chart-label w-full"
              >
                {bar}
              </button>
            ) : (
              bar
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ==========================================================================
   Payment mix
   ========================================================================== */

export function PaymentMix({
  mix,
}: {
  mix: { mode: string; amount: number; share: number }[];
}) {
  const mounted = useMounted();

  if (mix.length === 0) {
    return (
      <p className="neu-inset px-4 py-10 text-center text-sm font-medium text-ink-muted">
        No sales recorded yet.
      </p>
    );
  }

  const TONE: Record<string, string> = {
    cash: "bg-brand",
    upi: "bg-success",
    card: "bg-urgent",
    credit: "bg-notice",
  };

  const LABEL: Record<string, string> = {
    cash: "Cash",
    upi: "UPI",
    card: "Card",
    credit: "Credit (udhaar)",
  };

  return (
    <div>
      {/* A single stacked bar rather than a pie: four parts that must sum to a
          whole read faster as one length than as four radii. */}
      <div className="neu-inset flex h-5 w-full gap-0.5 overflow-hidden rounded-full p-1">
        {mix.map((entry) => (
          <span
            key={entry.mode}
            className={`h-full rounded-full ${TONE[entry.mode] ?? "bg-brand"}`}
            style={{
              width: mounted ? `${entry.share}%` : "0%",
              transition: "width 700ms var(--ease-soft)",
            }}
          />
        ))}
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {mix.map((entry) => (
          <li key={entry.mode} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`size-2.5 shrink-0 rounded-full ${TONE[entry.mode] ?? "bg-brand"}`}
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink-muted">
                {LABEL[entry.mode] ?? entry.mode}
              </p>
              <p className="tabular text-sm font-bold text-ink">
                {entry.share.toFixed(0)}%
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ==========================================================================
   Chart card wrapper
   ========================================================================== */

/** Standard heading + body wrapper, so every chart on the Insights page matches. */
export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`neu-raised p-6 ${className}`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
          {subtitle && (
            <p className="mt-1 text-sm font-medium text-ink-muted">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
