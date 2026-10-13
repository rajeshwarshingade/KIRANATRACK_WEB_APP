"use client";

/**
 * Dashboard.
 *
 * The screen an owner opens first, so it answers four questions in order, before
 * anything else on the page:
 *
 *   1. What did I take today?
 *   2. What is about to cost me money?
 *   3. What do I need to do about it?
 *   4. How do I ring up a sale?
 *
 * The bill button is a large primary action at the top rather than a fourth
 * stat tile, because it is the one thing on this screen that is *done* every
 * time it is opened, several dozen times a day.
 */

import Link from "next/link";
import { useMemo, useState } from "react";

import { AdvisorPreview } from "@/components/Advisor";
import { ChartCard, Donut, Sparkline } from "@/components/Charts";
import {
  AlertTriangle,
  Box,
  Cart,
  CheckCircle,
  Clock,
  Receipt,
  Rupee,
  Trash,
  TrendingUp,
  Truck,
} from "@/components/Icons";
import { AttributionBar, SiteFooter } from "@/components/Attribution";
import {
  Card,
  ConfirmDialog,
  EmptyState,
  Notice,
  PageHeader,
  PageSkeleton,
  SectionLabel,
  StatTile,
} from "@/components/ui";
import {
  activeProducts,
  dailySeries,
  expiryBuckets,
  healthBreakdown,
  lowStock,
  salesToday,
  stockValue,
  summarise,
  tradingDay,
} from "@/lib/analytics";
import { analyse } from "@/lib/advisor";
import { expiryCaption, formatDate, healthLabel } from "@/lib/dates";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { useStore } from "@/lib/store-context";
import type { StockHealth } from "@/lib/types";

export default function DashboardPage() {
  const store = useStore();
  const { products, sales, settings, hydrated, persistent, isDemo } = store;

  /**
   * Clearing the sample is destructive, so it asks first.
   *
   * The banner is keyed on recognising the sample shop's name, and a name is
   * something the owner could have typed into Settings by coincidence — so the
   * dialog states plainly what goes rather than just doing it.
   */
  const [confirmingSample, setConfirmingSample] = useState(false);

  const day = useMemo(() => tradingDay(settings), [settings]);

  const todayStats = useMemo(
    () => summarise(salesToday(sales, settings)),
    [sales, settings],
  );

  const trend = useMemo(() => dailySeries(sales, 14), [sales]);

  const alerts = useMemo(
    () =>
      expiryBuckets(products, settings).filter(
        (bucket) => bucket.health === "expired" || bucket.daysLeft <= settings.expiryWarnDays,
      ),
    [products, settings],
  );

  const low = useMemo(() => lowStock(products), [products]);

  const health = useMemo(
    () => healthBreakdown(products, settings),
    [products, settings],
  );

  const insights = useMemo(
    () => analyse({ products, sales, purchases: store.purchases, settings }),
    [products, sales, store.purchases, settings],
  );

  const live = useMemo(() => activeProducts(products), [products]);
  const stockWorth = useMemo(() => stockValue(live), [live]);

  if (!hydrated) return <PageSkeleton />;

  if (sales.length === 0 && products.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Your shop"
          title="Dashboard"
          description="Nothing is set up yet. Add what you sell, and the takings, expiry warnings and business advice fill in from there."
        />

        <div className="mt-8">
          <EmptyState
            title="Start with your stock"
            description="Add the items on your shelf and KiranaTrack takes it from there — it watches their expiry dates, tracks the margin on every sale, and tells you what to reorder. Everything stays on this device."
            icon={<Box size={30} />}
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/stock" className="neu-btn neu-btn-primary">
                  <Box size={18} /> Add your first product
                </Link>
                <Link href="/billing" className="neu-btn">
                  <Cart size={18} /> Ring up a bill
                </Link>
              </div>
            }
          />
        </div>

        {/*
          The sample shop, offered rather than imposed.

          It is genuinely the fastest way to understand what the charts and the
          advisor will do, and it was removed from first-run only because a shop
          owner opening onto someone else's 1,144 bills is worse than an empty
          screen. One tap, clearly labelled, and nothing merges with real data
          until they choose to load it.
        */}
        <Card className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold text-ink">
              Want to see it full first?
            </p>
            <p className="mt-1 text-sm font-medium leading-relaxed text-ink-muted">
              Load a sample shop with three months of bills, some expiring stock
              and a few mistakes — so you can see what the advisor catches. You
              can clear it in one tap afterwards.
            </p>
          </div>
          <button
            type="button"
            onClick={store.loadDemoData}
            className="neu-btn shrink-0"
          >
            Load the sample shop
          </button>
        </Card>

        <SiteFooter />
      </>
    );
  }

  const hasStock = live.some((p) => p.qty > 0);

  return (
    <>
      <PageHeader
        eyebrow={formatDate(day)}
        title={`${greeting()}, ${settings.profile.owner.split(" ")[0] || "there"}`}
        description={`${settings.profile.name} · ${
          isDemo
            ? "showing a demo shop — load your own data in Settings"
            : "all figures below are live from your own records"
        }`}
      />

      {!persistent && (
        <div className="mt-6">
          <Notice tone="warn">
            This browser is not saving data, so bills you record will be lost
            when you close the app. Private browsing is the usual cause. Export
            a backup from Settings before you rely on this.
          </Notice>
        </div>
      )}

      {isDemo && (
        <div className="neu-inset mt-6 flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold text-ink">
              You are looking at a sample shop
            </p>
            <p className="mt-1 text-sm font-medium text-ink-muted">
              These products and bills are not yours — they are here so the
              charts have something to show. Clear them and start with your own.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmingSample(true)}
            className="neu-btn neu-btn-primary shrink-0"
          >
            <Trash size={17} weight="bold" /> Clear sample data
          </button>
        </div>
      )}

      {/* Primary action — the thing done most often, first. */}
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        <Link
          href="/billing"
          className="neu-btn neu-btn-primary !min-h-16 !text-lg !tracking-wide"
        >
          <Cart size={22} weight="bold" /> New bill
        </Link>
        <Link
          href="/restock"
          className="neu-btn !min-h-16 !text-lg !tracking-wide"
        >
          <Truck size={22} weight="bold" /> Record a restock
        </Link>
      </div>

      {/* Today's position. */}
      <div className="mt-8">
        <SectionLabel>Today</SectionLabel>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <StatTile
            label="Takings"
            value={formatMoney(todayStats.revenue)}
            hint={`${todayStats.bills} bill${todayStats.bills === 1 ? "" : "s"}`}
            icon={<Rupee size={20} />}
            tone="brand"
          />
          <StatTile
            label="Profit"
            value={formatMoney(todayStats.profit)}
            hint={
              todayStats.revenue > 0
                ? `${((todayStats.profit / todayStats.revenue) * 100).toFixed(0)}% margin`
                : "no sales yet"
            }
            icon={<TrendingUp size={20} />}
            tone="success"
          />
          <StatTile
            label="Needs action"
            value={String(alerts.length)}
            hint={alerts.length === 0 ? "nothing expiring" : "expiring or expired"}
            icon={<AlertTriangle size={20} />}
            tone={alerts.length > 0 ? "danger" : "success"}
          />
          <StatTile
            label="Running low"
            value={String(low.length)}
            hint={low.length === 0 ? "all well stocked" : "below reorder point"}
            icon={<Box size={20} />}
            tone={low.length > 0 ? "notice" : "success"}
          />
        </div>
      </div>

      {/* 14-day trend and stock health. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <ChartCard
          title="Last 14 days"
          subtitle={`${formatMoneyCompact(
            trend.reduce((sum, day) => sum + day.revenue, 0),
          )} total · ${formatMoneyCompact(
            trend.reduce((sum, day) => sum + day.profit, 0),
          )} profit`}
          className="lg:col-span-3"
        >
          <Sparkline
            values={trend.map((d) => d.revenue)}
            height={72}
            tone="brand"
          />
          <div className="mt-3 flex justify-between text-xs font-semibold text-ink-faint">
            <span>{trend[0] ? formatDate(trend[0].date) : ""}</span>
            <span>Today</span>
          </div>
        </ChartCard>

        <ChartCard
          title="Stock health"
          subtitle={`${hasStock ? "every item on your shelf" : "no stock recorded"}`}
          className="lg:col-span-2"
        >
          <Donut
            slices={HEALTH_SLICES.map((slice) => ({
              label: slice.label,
              value: health[slice.key],
              color: slice.color,
            }))}
            centerLabel={`${live.filter((p) => p.qty > 0).length}`}
            centerSub="items"
            emptyLabel="Add stock to see its health."
          />
        </ChartCard>
      </div>

      {/* Expiring stock — the reason the app exists. */}
      <div className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <SectionLabel>Expiring soon</SectionLabel>
          <Link
            href="/stock?filter=expiring"
            className="text-xs font-bold uppercase tracking-widest text-brand hover:underline"
          >
            View all
          </Link>
        </div>

        <div className="mt-4">
          {alerts.length === 0 ? (
            <div className="neu-inset flex items-center gap-4 px-5 py-5">
              <span className="neu-well grid size-10 shrink-0 place-items-center text-success">
                <CheckCircle size={20} />
              </span>
              <div>
                <p className="font-display text-base font-bold text-ink">
                  Nothing is expiring
                </p>
                <p className="mt-0.5 text-sm font-medium text-ink-muted">
                  {hasStock
                    ? "Nothing on your shelf is inside the expiry warning window."
                    : "Add expiry dates to your products to get warnings before they cost you."}
                </p>
              </div>
            </div>
          ) : (
            <Card className="!p-0">
              <ul>
                {alerts.slice(0, 6).map((bucket) => (
                  <li
                    key={bucket.productId}
                    className="flex items-center gap-4 border-b border-shadow-dark/15 px-5 py-3.5 last:border-b-0"
                  >
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-full text-white ${
                        bucket.health === "expired"
                          ? "bg-danger"
                          : bucket.daysLeft <= settings.expiryCriticalDays
                            ? "bg-urgent"
                            : "bg-notice"
                      }`}
                    >
                      {bucket.health === "expired" ? (
                        <AlertTriangle size={16} />
                      ) : (
                        <Clock size={16} />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-bold text-ink">
                        {bucket.name}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-ink-muted">
                        {bucket.qty} in stock · worth{" "}
                        {formatMoney(bucket.value)} at cost
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p
                        className={`tabular text-sm font-bold ${
                          bucket.health === "expired"
                            ? "text-danger"
                            : bucket.daysLeft <= settings.expiryCriticalDays
                              ? "text-urgent"
                              : "text-notice"
                        }`}
                      >
                        {expiryCaption(bucket.expiry)}
                      </p>
                      <p className="mt-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-ink-faint">
                        {healthLabel(bucket.health)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {/* Advisor preview. */}
      {insights.length > 0 && (
        <div className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <SectionLabel>What to do next</SectionLabel>
            <Link
              href="/insights"
              className="text-xs font-bold uppercase tracking-widest text-brand hover:underline"
            >
              Full advisor
            </Link>
          </div>
          <div className="mt-4">
            <AdvisorPreview insights={insights} />
          </div>
        </div>
      )}

      {/* Where the money is. */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Stock value"
          value={formatMoneyCompact(stockWorth)}
          hint="at what you paid"
          icon={<Box size={20} />}
        />
        <StatTile
          label="Bills recorded"
          value={String(sales.length)}
          hint={`first ${sales.length ? formatDate(sales[0].at.slice(0, 10)) : "—"}`}
          icon={<Receipt size={20} />}
        />
        <StatTile
          label="Products"
          value={String(live.length)}
          hint={`${live.reduce((sum, p) => sum + p.qty, 0)} units on hand`}
          icon={<Box size={20} />}
        />
      </div>

      <div className="mt-10">
        <AttributionBar />
      </div>

      <ConfirmDialog
        open={confirmingSample}
        onClose={() => setConfirmingSample(false)}
        onConfirm={() => {
          store.clearSampleData();
          setConfirmingSample(false);
        }}
        title="Clear the sample shop"
        body={`This removes all ${live.length} sample products, ${sales.length} sample bills and every restock, and resets your shop name and details to blank. Nothing here is yours, so nothing of yours is lost — but it cannot be undone, and if you have started entering real data into this copy, that goes too.`}
        confirmLabel="Clear it all"
        destructive
      />

      <SiteFooter />
    </>
  );
}

/** Donut segments for the stock-health breakdown. */
const HEALTH_SLICES: { key: StockHealth; label: string; color: string }[] = [
  { key: "fresh", label: "Fresh", color: "bg-success" },
  { key: "warning", label: "Expiring soon", color: "bg-notice" },
  { key: "critical", label: "Urgent", color: "bg-urgent" },
  { key: "expired", label: "Expired", color: "bg-danger" },
  { key: "none", label: "No expiry tracked", color: "bg-shadow-dark" },
];

/**
 * Time-of-day greeting.
 *
 * Deliberately based on the clock rather than the trading-day cut-off: the
 * cut-off decides which day a bill belongs to for reporting, which is a
 * different question from how an owner should be greeted at 07:00.
 */
function greeting(): string {
  const now = new Date().getHours();
  if (now < 12) return "Good morning";
  if (now < 17) return "Good afternoon";
  return "Good evening";
}
