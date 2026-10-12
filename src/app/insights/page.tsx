"use client";

/**
 * Insights.
 *
 * Where the numbers become decisions. Two halves, deliberately in this order:
 *
 *  1. **What to do.** The advisor runs first and in full. An owner opening this
 *     screen wants to be told what to act on, not handed a dashboard to
 *     interpret — the charts are the evidence, not the headline.
 *  2. **Why.** The visualisations underneath, so a suggestion can be checked
 *     rather than taken on trust. Every figure here is computed by the same
 *     functions the advisor uses, so the two can never disagree.
 */

import { useMemo, useState } from "react";

import { AdvisorPanel } from "@/components/Advisor";
import { SiteFooter } from "@/components/Attribution";
import {
  ChartCard,
  ColumnChart,
  Donut,
  ExpiryTimeline,
  HorizontalBars,
  PaymentMix,
} from "@/components/Charts";
import {
  AlertTriangle,
  Box,
  Check,
  ChartBar,
  Rupee,
  Sparkle,
  TrendingUp,
} from "@/components/Icons";
import {
  Card,
  EmptyState,
  Meter,
  Notice,
  PageHeader,
  PageSkeleton,
  SectionLabel,
  SegmentedControl,
  StatTile,
} from "@/components/ui";
import {
  activeProducts,
  averageBasket,
  byCategory,
  dailySeries,
  deadStock,
  expiryBuckets,
  healthBreakdown,
  monthlySeries,
  paymentMix,
  purchaseSpend,
  salesToday,
  stockValue,
  summarise,
  tradingDay,
  velocity,
} from "@/lib/analytics";
import { analyse } from "@/lib/advisor";
import { formatDate, formatDateShort, formatMonth } from "@/lib/dates";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { useStore } from "@/lib/store-context";
import type { StockHealth } from "@/lib/types";

type Window = "7" | "30" | "90";

export default function InsightsPage() {
  const store = useStore();
  const { products, sales, purchases, settings, hydrated } = store;

  const [window, setWindow] = useState<Window>("30");

  const days = Number.parseInt(window, 10);
  const day = useMemo(() => tradingDay(settings), [settings]);

  const windowed = useMemo(
    () => sales.slice(-days * 40), // generous slice; filtered below by date
    [sales, days],
  );

  const inWindow = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const iso = cutoff.toISOString().slice(0, 10);
    return windowed.filter((sale) => sale.at.slice(0, 10) >= iso);
  }, [windowed, days]);

  const totals = useMemo(() => summarise(inWindow), [inWindow]);
  const today = useMemo(
    () => summarise(salesToday(sales, settings)),
    [sales, settings],
  );

  const series = useMemo(() => dailySeries(sales, days), [sales, days]);
  const months = useMemo(() => monthlySeries(sales), [sales]);
  const categories = useMemo(() => byCategory(sales, products), [sales, products]);
  const health = useMemo(
    () => healthBreakdown(products, settings),
    [products, settings],
  );
  const expiring = useMemo(
    () => expiryBuckets(products, settings).filter((b) => b.daysLeft <= 30),
    [products, settings],
  );
  const mix = useMemo(() => paymentMix(inWindow), [inWindow]);

  const live = useMemo(() => activeProducts(products), [products]);
  const held = useMemo(() => stockValue(live), [live]);

  /** Top sellers by revenue, using the cost snapshot on each sale line. */
  const topSellers = useMemo(() => {
    const vel = velocity(sales, products, days);
    const byId = new Map(products.map((p) => [p.id, p]));

    return [...vel.entries()]
      .map(([id, entry]) => ({ product: byId.get(id), ...entry }))
      .filter((row): row is typeof row & { product: NonNullable<typeof row.product> } =>
        Boolean(row.product),
      )
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((row) => ({
        label: row.product.name,
        value: row.revenue,
        sub: formatMoneyCompact(row.revenue),
      }));
  }, [sales, products, days]);

  /** Lines earning the least, to push them or drop them. */
  const weakMargins = useMemo(() => {
    return live
      .filter((p) => p.sellPrice > 0 && p.qty > 0)
      .map((p) => ({
        product: p,
        margin: ((p.sellPrice - p.costPrice) / p.sellPrice) * 100,
      }))
      .filter((row) => row.margin < 8)
      .sort((a, b) => a.margin - b.margin)
      .slice(0, 6);
  }, [live]);

  const slow = useMemo(() => deadStock(products, sales, days).slice(0, 6), [
    products,
    sales,
    days,
  ]);

  const insights = useMemo(
    () => analyse({ products, sales, purchases, settings }, 20),
    [products, sales, purchases, settings],
  );

  const basket = averageBasket(inWindow);
  const buying = purchaseSpend(purchases, days);

  if (!hydrated) return <PageSkeleton stats={4} />;

  if (sales.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Insights" title="Insights & advisor" />
        <div className="mt-8">
          <EmptyState
            title="Not enough history yet"
            description="The advisor reads your own sales to find what to reorder, what is going to expire and what is priced badly. Record a few days of bills and this fills in with advice specific to your shop."
            icon={<ChartBar size={30} />}
          />
        </div>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="What to do next"
        description="Read from your own sales and stock records. Every suggestion names the money involved and can be applied in one tap."
        action={
          <SegmentedControl
            label="Analysis window"
            value={window}
            onChange={setWindow}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
            ]}
          />
        }
      />

      {/* Headline position. */}
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={`Takings, ${days} days`}
          value={formatMoneyCompact(totals.revenue)}
          hint={`${totals.bills} bills`}
          icon={<Rupee size={20} />}
          tone="brand"
        />
        <StatTile
          label="Gross profit"
          value={formatMoneyCompact(totals.profit)}
          hint={
            totals.revenue > 0
              ? `${((totals.profit / totals.revenue) * 100).toFixed(1)}% margin`
              : "—"
          }
          icon={<TrendingUp size={20} />}
          tone="success"
        />
        <StatTile
          label="Average bill"
          value={formatMoney(basket)}
          hint="per customer"
        />
        <StatTile
          label="Stock held"
          value={formatMoneyCompact(held)}
          hint={
            buying > 0
              ? `${formatMoneyCompact(buying)} spent on restock`
              : "at what you paid"
          }
          icon={<Box size={20} />}
          tone={buying > 0 ? "notice" : "default"}
        />
      </div>

      {/* Today vs the window. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Today"
          value={formatMoney(today.revenue)}
          hint={`${today.bills} bill${today.bills === 1 ? "" : "s"} · ${formatDate(day)}`}
        />
        <StatTile
          label="Items sold"
          value={String(totals.units)}
          hint={`across ${live.length} products`}
        />
        <StatTile
          label="GST collected"
          value={formatMoneyCompact(totals.tax)}
          hint="your liability this period"
          tone="notice"
        />
      </div>

      {/* The advisor — first, because it is the point of the screen. */}
      <div className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionLabel>Business advisor</SectionLabel>
            <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-ink-muted">
              <Sparkle size={16} className="text-brand" />
              Computed on this device from your records
            </p>
          </div>
          {store.settings.ai.provider && store.settings.ai.apiKey ? (
            <span className="neu-capsule neu-capsule-success">
              <Check size={14} /> AI briefing available
            </span>
          ) : (
            <span className="neu-capsule">Offline analysis</span>
          )}
        </div>

        <div className="mt-5">
          <AdvisorPanel insights={insights} showAi />
        </div>
      </div>

      {/* Trends. */}
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <ChartCard
          title={`Revenue, last ${days} days`}
          subtitle={`${formatMoney(totals.revenue)} total · peak ${formatMoney(
            Math.max(0, ...series.map((d) => d.revenue)),
          )}`}
        >
          <ColumnChart
            buckets={series.map((d) => ({
              key: d.date,
              value: d.revenue,
              label: formatDateShort(d.date),
            }))}
            emptyLabel="No sales in this window."
            format={formatMoneyCompact}
          />
        </ChartCard>

        <ChartCard
          title="Revenue by category"
          subtitle="Where the money actually comes from"
        >
          <HorizontalBars
            items={categories.slice(0, 8).map((c) => ({
              label: c.category,
              value: c.revenue,
              sub: formatMoneyCompact(c.revenue),
            }))}
            emptyLabel="No sales recorded yet."
          />
        </ChartCard>

        <ChartCard
          title="Monthly trend"
          subtitle="Takings and bills by month"
        >
          <ColumnChart
            buckets={months.slice(-12).map((m) => ({
              key: m.key,
              value: m.revenue,
              label: formatMonth(m.key),
            }))}
            emptyLabel="No sales recorded yet."
            format={formatMoneyCompact}
            heightClass="h-24"
          />
        </ChartCard>

        <ChartCard title="How customers paid" subtitle="Cash in the drawer vs digital">
          <PaymentMix mix={mix} />
        </ChartCard>

        <ChartCard
          title="Top sellers"
          subtitle={`By revenue over ${days} days`}
        >
          <HorizontalBars
            items={topSellers}
            emptyLabel="No sales in this window."
          />
        </ChartCard>

        <ChartCard
          title="Stock health"
          subtitle="Every item on your shelf"
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

      {/* Expiry. */}
      {expiring.length > 0 && (
        <div className="mt-10">
          <SectionLabel>Expiry — next 30 days</SectionLabel>
          <Card className="mt-4">
            {expiring.length === 1 &&
            expiring[0].daysLeft < 0 ? (
              <div className="mb-5">
                <Notice tone="danger">
                  {expiring[0].name} is past its date and still on the shelf.
                  Write it off from the Stock screen so your stock value stays
                  accurate.
                </Notice>
              </div>
            ) : null}

            <ExpiryTimeline
              buckets={expiring.map((b) => ({
                productId: b.productId,
                name: b.name,
                qty: b.qty,
                daysLeft: b.daysLeft,
                value: b.value,
              }))}
            />
          </Card>
        </div>
      )}

      {/* Weak margins. */}
      {weakMargins.length > 0 && (
        <div className="mt-10">
          <SectionLabel>Thin margins</SectionLabel>
          <p className="mt-1.5 text-sm font-medium text-ink-muted">
            These earn under 8%. Below 5% you are working for very little.
          </p>

          <Card className="mt-4 !p-0">
            <ul>
              {weakMargins.map(({ product, margin }) => (
                <li
                  key={product.id}
                  className="flex flex-wrap items-center gap-4 border-b border-shadow-dark/15 px-5 py-4 last:border-b-0"
                >
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-full text-white ${
                      margin < 0
                        ? "bg-danger"
                        : margin < 5
                          ? "bg-urgent"
                          : "bg-notice"
                    }`}
                  >
                    <AlertTriangle size={17} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-bold text-ink">
                      {product.name}
                    </p>
                    <p className="tabular mt-0.5 text-xs font-semibold text-ink-muted">
                      cost {formatMoney(product.costPrice)} · sells{" "}
                      {formatMoney(product.sellPrice)} · {product.qty} in stock
                    </p>
                  </div>

                  <div className="w-full sm:w-44">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-muted">
                        Margin
                      </span>
                      <span
                        className={`tabular text-sm font-bold ${
                          margin < 0
                            ? "text-danger"
                            : margin < 5
                              ? "text-urgent"
                              : "text-notice"
                        }`}
                      >
                        {margin.toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Meter
                        value={Math.max(0, margin)}
                        max={20}
                        tone={
                          margin < 0 ? "danger" : margin < 5 ? "notice" : "success"
                        }
                        label={`${product.name} margin`}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* Dead stock. */}
      {slow.length > 0 && (
        <div className="mt-10">
          <SectionLabel>Not moving</SectionLabel>
          <p className="mt-1.5 text-sm font-medium text-ink-muted">
            No sales in {days} days. Money on these is money not paying the rent.
          </p>

          <Card className="mt-4 !p-0">
            <ul>
              {slow.map(({ product, value, daysIdle }) => (
                <li
                  key={product.id}
                  className="flex flex-wrap items-center gap-4 border-b border-shadow-dark/15 px-5 py-4 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-bold text-ink">
                      {product.name}
                    </p>
                    <p className="tabular mt-0.5 text-xs font-semibold text-ink-muted">
                      {product.qty} in stock · in the catalogue {daysIdle} days
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="tabular font-display text-lg font-bold text-notice">
                      {formatMoney(value)}
                    </p>
                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-ink-faint">
                      tied up at cost
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* Profit by category — the bottom of the page, because it is reference
          rather than action. */}
      <div className="mt-10">
        <SectionLabel>Profit by category</SectionLabel>
        <Card className="mt-4">
          <ul className="space-y-3">
            {categories.slice(0, 8).map((category) => {
              const margin =
                category.revenue === 0
                  ? 0
                  : (category.profit / category.revenue) * 100;

              return (
                <li key={category.category}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-ink">
                      {category.category}
                    </span>
                    <span className="tabular text-sm font-bold text-success">
                      {formatMoney(category.profit)} · {margin.toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Meter
                      value={Math.max(0, margin)}
                      max={40}
                      tone={margin < 5 ? "notice" : "success"}
                      label={`${category.category} margin`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <p className="mt-8 text-xs font-medium leading-relaxed text-ink-faint">
        Figures are calculated on this device from your own records. Confidence
        on each suggestion reflects how much sales history backs it — a
        suggestion from two weeks of data is flagged lower than one from a
        quarter.
      </p>

      <SiteFooter />
    </>
  );
}

const HEALTH_SLICES: { key: StockHealth; label: string; color: string }[] = [
  { key: "fresh", label: "Fresh", color: "bg-success" },
  { key: "warning", label: "Expiring soon", color: "bg-notice" },
  { key: "critical", label: "Urgent", color: "bg-urgent" },
  { key: "expired", label: "Expired", color: "bg-danger" },
  { key: "none", label: "No expiry tracked", color: "bg-shadow-dark" },
];
