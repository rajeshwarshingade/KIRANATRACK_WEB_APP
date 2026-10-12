"use client";

/**
 * Activity.
 *
 * The audit trail. Every change to stock or a bill appends an entry here, so
 * "why is this number different from what I remember?" always has an answer.
 *
 * In a shop running on paper and memory, the question that cannot be answered
 * is the one that quietly costs money — a carton that went missing two weeks ago
 * is written off as "somebody took it" and never recovered. This log is the
 * answer to that.
 */

import { useMemo, useState } from "react";

import { SiteFooter } from "@/components/Attribution";
import {
  AlertTriangle,
  Box,
  Check,
  History,
  Receipt,
  Settings as SettingsIcon,
  Trash,
  Truck,
} from "@/components/Icons";
import {
  Card,
  ConfirmDialog,
  EmptyState,
  Notice,
  PageHeader,
  PageSkeleton,
  SegmentedControl,
} from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store-context";
import type { ActivityEvent, EventKind } from "@/lib/types";

type Range = "today" | "week" | "month" | "all";

const RANGE_LABEL: Record<Range, string> = {
  today: "Today",
  week: "7 days",
  month: "30 days",
  all: "All",
};

/** Visual treatment per event kind. */
const KIND_STYLE: Record<
  EventKind,
  { icon: React.ReactNode; tone: string; label: string }
> = {
  sale: {
    icon: <Receipt size={16} />,
    tone: "bg-brand text-white",
    label: "Sale",
  },
  purchase: {
    icon: <Truck size={16} />,
    tone: "bg-success text-white",
    label: "Restock",
  },
  product_add: {
    icon: <Box size={16} />,
    tone: "bg-shadow-dark/40 text-ink-muted",
    label: "Product added",
  },
  product_edit: {
    icon: <SettingsIcon size={16} />,
    tone: "bg-shadow-dark/40 text-ink-muted",
    label: "Product edited",
  },
  product_delete: {
    icon: <Trash size={16} />,
    tone: "bg-notice text-white",
    label: "Product removed",
  },
  stock_adjust: {
    icon: <AlertTriangle size={16} />,
    tone: "bg-danger text-white",
    label: "Stock adjusted",
  },
  settings: {
    icon: <SettingsIcon size={16} />,
    tone: "bg-shadow-dark/40 text-ink-muted",
    label: "Settings",
  },
};

export default function ActivityPage() {
  const store = useStore();
  const { events, hydrated } = store;

  const [range, setRange] = useState<Range>("week");
  const [confirming, setConfirming] = useState(false);

  const visible = useMemo(() => {
    if (range === "all") return events;

    const cutoff = new Date();
    if (range === "today") cutoff.setHours(0, 0, 0, 0);
    else cutoff.setDate(cutoff.getDate() - (range === "week" ? 7 : 30));

    return events.filter((event) => new Date(event.at) >= cutoff);
  }, [events, range]);

  /** Group by calendar day so the trail reads as a diary. */
  const grouped = useMemo(() => {
    const groups = new Map<string, ActivityEvent[]>();
    for (const event of visible) {
      const key = event.at.slice(0, 10);
      const list = groups.get(key) ?? [];
      list.push(event);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [visible]);

  /** Net money in and out over the filtered window. */
  const net = useMemo(
    () =>
      visible.reduce(
        (acc, event) => {
          if (event.valueImpact === null) return acc;
          if (event.kind === "purchase") acc.out += -event.valueImpact;
          else if (event.kind === "stock_adjust")
            acc.lost += -event.valueImpact;
          else acc.in += event.valueImpact;
          return acc;
        },
        { in: 0, out: 0, lost: 0 },
      ),
    [visible],
  );

  if (!hydrated) return <PageSkeleton stats={3} />;

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Activity"
        description="Everything that has changed your stock or your bills, newest first. This is what the shop's paper register would have been."
        action={
          events.length > 0 ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="neu-btn neu-btn-sm"
            >
              <Trash size={16} /> Clear log
            </button>
          ) : undefined
        }
      />

      {/* Net movement — the log turned back into money. */}
      {visible.length > 0 && (
        <div className="mt-7 grid gap-4 sm:grid-cols-3">
          <div className="neu-inset flex items-center gap-4 px-5 py-4">
            <span className="neu-well grid size-11 shrink-0 place-items-center text-success">
              <Check size={20} />
            </span>
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-wider text-ink-muted">
                Money in
              </p>
              <p className="tabular mt-1 font-display text-xl font-bold text-success">
                {formatMoney(net.in)}
              </p>
            </div>
          </div>

          <div className="neu-inset flex items-center gap-4 px-5 py-4">
            <span className="neu-well grid size-11 shrink-0 place-items-center text-brand">
              <Truck size={20} />
            </span>
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-wider text-ink-muted">
                Paid out
              </p>
              <p className="tabular mt-1 font-display text-xl font-bold text-brand">
                {formatMoney(net.out)}
              </p>
            </div>
          </div>

          <div className="neu-inset flex items-center gap-4 px-5 py-4">
            <span className="neu-well grid size-11 shrink-0 place-items-center text-danger">
              <AlertTriangle size={20} />
            </span>
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-wider text-ink-muted">
                Written off
              </p>
              <p className="tabular mt-1 font-display text-xl font-bold text-danger">
                {formatMoney(net.lost)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-7">
        <SegmentedControl
          label="Date range"
          value={range}
          onChange={setRange}
          options={(Object.keys(RANGE_LABEL) as Range[]).map((key) => ({
            value: key,
            label: RANGE_LABEL[key],
          }))}
        />
      </div>

      <div className="mt-6">
        {grouped.length === 0 ? (
          <EmptyState
            title={events.length === 0 ? "Nothing recorded yet" : "Nothing in this period"}
            description={
              events.length === 0
                ? "Bills, restocks and stock adjustments all appear here as you use the app."
                : "Try a wider period to see older activity."
            }
            icon={<History size={30} />}
          />
        ) : (
          <div className="space-y-8">
            {grouped.map(([date, entries]) => {
              const dayIn = entries.reduce(
                (sum, e) => sum + (e.kind === "sale" ? (e.valueImpact ?? 0) : 0),
                0,
              );

              return (
                <section key={date}>
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-ink-muted">
                      {formatDate(date)}
                    </h2>
                    {dayIn > 0 && (
                      <p className="tabular text-xs font-bold text-success">
                        + {formatMoney(dayIn)}
                      </p>
                    )}
                  </div>

                  <Card className="mt-3 !p-0">
                    <ul>
                      {entries.map((event) => {
                        const style = KIND_STYLE[event.kind];

                        return (
                          <li
                            key={event.id}
                            className="flex items-start gap-4 border-b border-shadow-dark/15 px-5 py-4 last:border-b-0"
                          >
                            <span
                              className={`grid size-9 shrink-0 place-items-center rounded-full ${style.tone}`}
                            >
                              {style.icon}
                            </span>

                            <div className="min-w-0 flex-1">
                              <p className="font-display text-base font-bold text-ink">
                                {event.title}
                              </p>
                              <p className="mt-0.5 text-xs font-medium text-ink-muted">
                                {event.detail}
                              </p>
                            </div>

                            <div className="shrink-0 text-right">
                              {event.valueImpact !== null && (
                                <p
                                  className={`tabular text-sm font-bold ${
                                    event.valueImpact >= 0
                                      ? "text-success"
                                      : "text-danger"
                                  }`}
                                >
                                  {event.valueImpact >= 0 ? "+" : "−"}
                                  {formatMoney(Math.abs(event.valueImpact))}
                                </p>
                              )}
                              <p className="tabular mt-0.5 text-[0.65rem] font-semibold text-ink-faint">
                                {new Date(event.at).toLocaleTimeString(undefined, {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-8">
        <Notice tone="brand">
          The log keeps the most recent 500 events. It is a record of what
          happened, not a second copy of your data — your products, bills and
          purchases are stored separately and are never trimmed.
        </Notice>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          store.clearEventLog();
          setConfirming(false);
        }}
        title="Clear the activity log"
        body="This removes the history of what happened, but it does not touch your products, bills or purchases. The log cannot be recovered once cleared — export a backup first if you want to keep the record."
        confirmLabel="Clear log"
        destructive
      />

      <SiteFooter />
    </>
  );
}
