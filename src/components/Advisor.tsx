"use client";

/**
 * The advisor panel.
 *
 * Renders the insights from `lib/advisor.ts` and, where an insight carries a
 * typed action, offers the button that performs it. That is the difference
 * between reporting and advising: "your milk is about to expire" is a fact, and
 * "Mark down 40%" next to it is something the owner can act on in one tap
 * without opening a product form and working out the arithmetic themselves.
 *
 * Confidence is shown, because these are inferences from the shop's own data,
 * not certainties. An owner who sees "80% confident" treats it as a strong hint;
 * one who sees no qualifier treats every suggestion as fact, and stops reading
 * the ones that are wrong.
 */

import { useState } from "react";

import {
  AlertTriangle,
  Check,
  Info,
  Sparkle,
  TrendingUp,
} from "./Icons";
import { askAi } from "@/lib/ai";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store-context";
import type { AdvisorInsight, AdvisorSeverity } from "@/lib/types";

const SEVERITY_STYLE: Record<
  AdvisorSeverity,
  { chip: string; icon: React.ReactNode; label: string }
> = {
  critical: {
    chip: "bg-danger text-white",
    icon: <AlertTriangle size={16} />,
    label: "Act now",
  },
  warning: {
    chip: "bg-notice text-white",
    icon: <AlertTriangle size={16} />,
    label: "Soon",
  },
  info: {
    chip: "bg-shadow-dark/30 text-ink-muted",
    icon: <Info size={16} />,
    label: "Worth knowing",
  },
  positive: {
    chip: "bg-success text-white",
    icon: <TrendingUp size={16} />,
    label: "Going well",
  },
};

export function AdvisorPanel({
  insights,
  limit,
  showAi,
}: {
  insights: AdvisorInsight[];
  /** Show only the first N, with a "show all" toggle. */
  limit?: number;
  showAi?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const store = useStore();

  const visible = expanded || !limit ? insights : insights.slice(0, limit);

  if (insights.length === 0) {
    return (
      <div className="neu-inset flex flex-col items-center px-6 py-12 text-center">
        <span className="neu-well grid size-14 place-items-center text-success">
          <Check size={26} />
        </span>
        <h3 className="mt-5 font-display text-lg font-bold text-ink">
          Nothing needs your attention
        </h3>
        <p className="mt-2 max-w-sm text-sm font-medium leading-relaxed text-ink-muted">
          No expiring stock, no fast seller running out, nothing priced below
          cost. This panel stays empty on purpose — it will only speak up when
          there is something genuinely worth doing.
        </p>
      </div>
    );
  }

  /**
   * Run a typed advisor action.
   *
   * Every branch goes through the store's own write layer rather than setting
   * state directly, so applying advice produces the same audit entry as doing
   * the thing by hand.
   */
  function applyAction(insight: AdvisorInsight) {
    if (!insight.action) return;

    setBusy(insight.id);
    let outcome;

    switch (insight.action.kind) {
      case "restock":
        outcome = store.setReorderPoint(
          insight.action.productId,
          insight.action.qty,
        );
        break;
      case "markdown":
        outcome = store.changePrice(insight.action.productId, insight.action.pct);
        break;
      case "adjustReorder":
        outcome = store.setReorderPoint(
          insight.action.productId,
          insight.action.value,
        );
        break;
      case "writeOff":
        outcome = store.writeOff(
          insight.action.productId,
          insight.action.qty,
          "Expired — written off from the advisor",
        );
        break;
    }

    setBusy(null);

    // A fresh read is what the advisor re-runs against, so the panel reflects
    // reality the moment after an action lands.
    setResult(outcome.message);
    setTimeout(() => setResult(null), 4000);
  }

  async function runAi() {
    setAiLoading(true);
    setAiError(null);

    const outcome = await askAi({
      provider: store.settings.ai.provider,
      apiKey: store.settings.ai.apiKey,
      model: store.settings.ai.model,
      insights,
      summary: [],
    });

    if (outcome.ok) setResult(outcome.text);
    else setAiError(outcome.error);

    setAiLoading(false);
  }

  return (
    <div className="space-y-4">
      {result && (
        <div
          role="status"
          className="neu-raised whitespace-pre-wrap px-5 py-4 text-sm font-medium leading-relaxed text-ink-muted"
        >
          {result}
        </div>
      )}

      {aiError && (
        <p role="status" className="neu-inset px-4 py-3 text-sm font-semibold text-notice">
          {aiError}
        </p>
      )}

      <ul className="space-y-3.5">
        {visible.map((insight) => {
          const style = SEVERITY_STYLE[insight.severity];

          return (
            <li key={insight.id} className="neu-raised p-5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider ${style.chip}`}
                >
                  {style.icon}
                  {style.label}
                </span>

                {insight.impact !== null && insight.impact > 0 && (
                  <span className="tabular text-sm font-bold text-brand">
                    {formatMoney(insight.impact)} at stake
                  </span>
                )}

                <span className="ml-auto flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-ink-faint">
                  {insight.confidence}% confident
                </span>
              </div>

              <h3 className="mt-3 font-display text-lg font-bold text-ink">
                {insight.title}
              </h3>

              <p className="mt-2 text-sm font-medium leading-relaxed text-ink-muted">
                {insight.detail}
              </p>

              {insight.actionLabel && insight.action && (
                <button
                  type="button"
                  onClick={() => applyAction(insight)}
                  disabled={busy === insight.id}
                  className="neu-btn neu-btn-primary neu-btn-sm mt-4"
                >
                  {busy === insight.id ? "Applying…" : insight.actionLabel}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {limit && insights.length > limit && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="neu-btn neu-btn-sm"
          >
            {expanded ? "Show less" : `Show all ${insights.length}`}
          </button>
        )}

        {showAi && (
          <button
            type="button"
            onClick={runAi}
            disabled={aiLoading}
            className="neu-btn neu-btn-sm"
          >
            <Sparkle size={16} />
            {aiLoading ? "Writing…" : "Ask AI to explain"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Compact preview for the dashboard.
 *
 * Two insights, no action buttons — the dashboard is a glance, and the full
 * panel is one tap away. Showing every insight here would bury the numbers the
 * owner actually opened the app to see.
 */
export function AdvisorPreview({ insights }: { insights: AdvisorInsight[] }) {
  if (insights.length === 0) return null;

  return (
    <ul className="space-y-3">
      {insights.slice(0, 2).map((insight) => {
        const style = SEVERITY_STYLE[insight.severity];

        return (
          <li
            key={insight.id}
            className="neu-raised flex items-start gap-4 px-5 py-4"
          >
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full ${
                insight.severity === "critical"
                  ? "bg-danger text-white"
                  : insight.severity === "warning"
                    ? "bg-notice text-white"
                    : insight.severity === "positive"
                      ? "bg-success text-white"
                      : "bg-shadow-dark/30 text-ink-muted"
              }`}
            >
              {style.icon}
            </span>

            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold text-ink">
                {insight.title}
              </p>
              <p className="mt-1 line-clamp-2 text-sm font-medium leading-relaxed text-ink-muted">
                {insight.detail}
              </p>
            </div>

            {insight.impact !== null && insight.impact > 0 && (
              <span className="tabular shrink-0 self-center text-sm font-bold text-brand">
                {formatMoney(insight.impact)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
