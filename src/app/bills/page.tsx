"use client";

/**
 * Bills.
 *
 * The bill register and day book in one screen, because they answer the same
 * question from different angles: what did I sell, and to whom. The register is
 * the searchable list of every bill; the day book reconciles a single day's
 * takings by payment mode, which is what the owner actually needs at closing
 * time to know how much cash is in the drawer.
 *
 * Bills are never edited or deleted. A GST invoice that has been issued is a
 * legal document — cancelling it and re-issuing is the correct response to a
 * mistake, and silently editing a number that has already been declared is not.
 */

import { useMemo, useState } from "react";
import Link from "next/link";

import { SiteFooter } from "@/components/Attribution";
import { ChartCard, PaymentMix } from "@/components/Charts";
import {
  Cart,
  Check,
  Close,
  Download,
  Print,
  Receipt,
  Search,
  Truck,
} from "@/components/Icons";
import {
  Card,
  EmptyState,
  Modal,
  Notice,
  PageHeader,
  PageSkeleton,
  SectionLabel,
  SegmentedControl,
  StatTile,
} from "@/components/ui";
import { exportDayBookCsv, printReceipt } from "@/lib/backup";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store-context";
import {
  salesLastDays,
  salesToday,
  tradingDay,
} from "@/lib/analytics";
import { formatDate, formatDateTime } from "@/lib/dates";
import {
  UNIT_LABEL,
  type PaymentMode,
  type Sale,
} from "@/lib/types";

type Range = "today" | "week" | "month" | "all";

const RANGE_LABEL: Record<Range, string> = {
  today: "Today",
  week: "7 days",
  month: "30 days",
  all: "All",
};

const MODE_LABEL: Record<PaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  credit: "Credit",
};

export default function BillsPage() {
  const store = useStore();
  const { sales, purchases, settings, hydrated } = store;

  const [range, setRange] = useState<Range>("today");
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<Sale | null>(null);

  const day = useMemo(() => tradingDay(settings), [settings]);

  /** Newest first — the bill you just made is the one you want to see. */
  const ordered = useMemo(
    () => [...sales].sort((a, b) => b.at.localeCompare(a.at)),
    [sales],
  );

  /*
   * The period filter and the day book read from the SAME window definition.
   *
   * They previously used two different comparisons — `>= day` for the filter and
   * `=== day` for the day book — which disagreed whenever a bill was rung after
   * midnight on a shop with an 08:00 cut-off: the tile showed one figure and the
   * card directly beneath it showed another. `salesToday` / `salesLastDays` are
   * the single source of truth for which bills belong to when.
   */
  const inRange = useMemo(() => {
    switch (range) {
      case "today":
        return salesToday(sales, settings);
      case "week":
        return salesLastDays(sales, settings, 7);
      case "month":
        return salesLastDays(sales, settings, 30);
      default:
        return ordered;
    }
  }, [sales, settings, range, ordered]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return inRange;

    return inRange.filter((sale) =>
      `${sale.invoiceNo} ${sale.customerName} ${sale.customerPhone}`
        .toLowerCase()
        .includes(needle),
    );
  }, [inRange, query]);

  const totals = useMemo(
    () =>
      inRange.reduce(
        (acc, sale) => {
          acc.total += sale.total;
          acc.tax += sale.cgst + sale.sgst;
          acc.profit += sale.lines.reduce(
            (sum, line) =>
              sum + Math.round(line.unitPrice * line.qty) - line.costAtSale * line.qty,
            0,
          );
          return acc;
        },
        { total: 0, tax: 0, profit: 0 },
      ),
    [inRange],
  );

  const mix = useMemo(() => {
    const byMode = new Map<PaymentMode, number>();
    inRange.forEach((sale) =>
      byMode.set(sale.mode, (byMode.get(sale.mode) ?? 0) + sale.total),
    );

    const grand = [...byMode.values()].reduce((sum, v) => sum + v, 0);
    return [...byMode.entries()]
      .map(([mode, amount]) => ({
        mode,
        amount,
        share: grand === 0 ? 0 : (amount / grand) * 100,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [inRange]);

  const todays = useMemo(() => salesToday(sales, settings), [sales, settings]);

  if (!hydrated) return <PageSkeleton stats={3} />;

  if (sales.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Billing" title="Bills" />
        <div className="mt-8">
          <EmptyState
            title="No bills yet"
            description="Every bill you save appears here, with its tax split, so you can reprint a receipt or reconcile a day's takings."
            icon={<Receipt size={30} />}
            action={
              <Link href="/billing" className="neu-btn neu-btn-primary">
                <Cart size={18} /> Create the first bill
              </Link>
            }
          />
        </div>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Bills & day book"
        description="Every bill you have saved. Filter by period, search by invoice number or customer, and reprint any receipt."
        action={
          <button
            type="button"
            onClick={() => exportDayBookCsv(inRange)}
            className="neu-btn neu-btn-sm"
          >
            <Download size={16} /> Export CSV
          </button>
        }
      />

      {/* Period totals. */}
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Takings"
          value={formatMoney(totals.total)}
          hint={`${inRange.length} bill${inRange.length === 1 ? "" : "s"}`}
          tone="brand"
        />
        <StatTile
          label="GST collected"
          value={formatMoney(totals.tax)}
          hint="CGST + SGST, your liability"
          tone="notice"
        />
        <StatTile
          label="Gross profit"
          value={formatMoney(totals.profit)}
          hint={
            totals.total > 0
              ? `${((totals.profit / totals.total) * 100).toFixed(1)}% margin`
              : "no sales"
          }
          tone="success"
        />
        <StatTile
          label="Credit given"
          value={formatMoney(
            inRange
              .filter((s) => s.mode === "credit")
              .reduce((sum, s) => sum + s.total, 0),
          )}
          hint="udhaar to collect"
        />
      </div>

      {/* Today's reconciliation. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <ChartCard
          title={`Today's takings`}
          subtitle={`${formatDate(day)} · ${todays.length} bill${todays.length === 1 ? "" : "s"}`}
        >
          <PaymentMix mix={mix} />
          <p className="mt-5 text-sm font-medium text-ink-muted">
            Cash in the drawer and UPI settled today:{" "}
            <span className="tabular font-bold text-ink">
              {formatMoney(
                inRange
                  .filter((s) => s.mode === "cash" || s.mode === "upi")
                  .reduce((sum, s) => sum + s.total, 0),
              )}
            </span>
          </p>
        </ChartCard>

        <ChartCard
          title="Filter"
          subtitle="Narrow the register to a period"
        >
          <SegmentedControl
            label="Date range"
            value={range}
            onChange={setRange}
            options={(Object.keys(RANGE_LABEL) as Range[]).map((key) => ({
              value: key,
              label: RANGE_LABEL[key],
            }))}
          />

          <div className="relative mt-5">
            <Search
              size={17}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Invoice number or customer…"
              aria-label="Search bills"
              className="neu-input !pl-11"
            />
          </div>

          <p className="mt-4 text-sm font-semibold text-ink-muted">
            Showing {visible.length} of {ordered.length} bills
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link href="/billing" className="neu-btn neu-btn-primary neu-btn-sm">
              <Cart size={16} /> New bill
            </Link>
            <Link href="/restock" className="neu-btn neu-btn-sm">
              <Truck size={16} /> Restock
            </Link>
          </div>
        </ChartCard>
      </div>

      {/* The register. */}
      <div className="mt-8">
        <SectionLabel>Register</SectionLabel>

        <div className="mt-4">
          {visible.length === 0 ? (
            <EmptyState
              title="Nothing in this range"
              description="No bills match the current filter. Try a wider period, or clear the search."
              icon={<Receipt size={30} />}
            />
          ) : (
            <Card className="!p-0">
              <ul>
                {visible.map((sale) => (
                  <li
                    key={sale.id}
                    className="flex flex-wrap items-center gap-4 border-b border-shadow-dark/15 px-5 py-4 last:border-b-0"
                  >
                    <span className="neu-well grid size-10 shrink-0 place-items-center text-brand">
                      <Receipt size={18} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="tabular font-display text-base font-bold text-ink">
                          {sale.invoiceNo}
                        </p>
                        <span className="neu-capsule !text-[0.62rem] !py-1">
                          {MODE_LABEL[sale.mode]}
                        </span>
                        {sale.customerName && (
                          <span className="text-sm font-semibold text-ink-muted">
                            {sale.customerName}
                          </span>
                        )}
                      </div>

                      <p className="tabular mt-1 text-xs font-semibold text-ink-faint">
                        {formatDateTime(sale.at)} ·{" "}
                        {sale.lines.reduce((sum, l) => sum + l.qty, 0)} items ·{" "}
                        {formatMoney(sale.cgst + sale.sgst)} GST
                      </p>
                    </div>

                    <p className="tabular shrink-0 font-display text-lg font-bold text-ink">
                      {formatMoney(sale.total)}
                    </p>

                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          printReceipt(sale, settings.profile.name, settings.profile.gstin)
                        }
                        aria-label={`Print ${sale.invoiceNo}`}
                        title="Print receipt"
                        className="neu-btn neu-btn-sm !min-h-0 !p-2"
                      >
                        <Print size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewing(sale)}
                        aria-label={`View ${sale.invoiceNo}`}
                        title="View bill"
                        className="neu-btn neu-btn-sm !min-h-0 !p-2"
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {purchases.length > 0 && (
        <p className="mt-6 text-xs font-medium text-ink-faint">
          What you have <em>bought</em> is tracked separately — see the{" "}
          <Link href="/restock" className="font-bold text-brand hover:underline">
            restock ledger
          </Link>{" "}
          for {purchases.length} supplier bill
          {purchases.length === 1 ? "" : "s"} recorded.
        </p>
      )}

      <BillDetail
        sale={viewing}
        onClose={() => setViewing(null)}
        storeName={settings.profile.name}
        gstin={settings.profile.gstin}
      />

      <SiteFooter />
    </>
  );
}

/* ==========================================================================
   Bill detail
   ========================================================================== */

function BillDetail({
  sale,
  onClose,
  storeName,
  gstin,
}: {
  sale: Sale | null;
  onClose: () => void;
  storeName: string;
  gstin: string;
}) {
  if (!sale) return null;

  const interState = sale.cgst === 0 && sale.sgst > 0;
  const profit = sale.lines.reduce(
    (sum, line) =>
      sum + Math.round(line.unitPrice * line.qty) - line.costAtSale * line.qty,
    0,
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`${sale.invoiceNo}`}
      wide
      footer={
        <>
          <button type="button" className="neu-btn" onClick={onClose}>
            <Close size={18} /> Close
          </button>
          <button
            type="button"
            className="neu-btn neu-btn-primary"
            onClick={() => printReceipt(sale, storeName, gstin)}
          >
            <Print size={18} /> Print receipt
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="neu-inset px-4 py-3">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-muted">
            Billed
          </p>
          <p className="tabular mt-1 text-sm font-bold text-ink">
            {formatDateTime(sale.at)}
          </p>
          <p className="mt-1 text-xs font-semibold text-ink-muted">
            {MODE_LABEL[sale.mode]}
            {sale.customerName && ` · ${sale.customerName}`}
            {sale.customerPhone && ` · ${sale.customerPhone}`}
          </p>
        </div>

        <div>
          <p className="neu-label">Items</p>
          <ul className="space-y-2">
            {sale.lines.map((line, index) => (
              <li
                key={`${line.productId}-${index}`}
                className="neu-inset-sm flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-bold text-ink">
                    {line.name}
                  </p>
                  <p className="tabular mt-0.5 text-xs font-semibold text-ink-muted">
                    {line.qty} {UNIT_LABEL[line.unit].toLowerCase()} ×{" "}
                    {formatMoney(line.unitPrice)} · GST {line.taxRate}%
                  </p>
                </div>
                <p className="tabular shrink-0 text-base font-bold text-ink">
                  {formatMoney(line.amount)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="font-semibold text-ink-muted">Subtotal</dt>
            <dd className="tabular font-bold text-ink-muted">
              {formatMoney(sale.subtotal)}
            </dd>
          </div>

          {sale.discount > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="font-semibold text-notice">Discount</dt>
              <dd className="tabular font-bold text-notice">
                − {formatMoney(sale.discount)}
              </dd>
            </div>
          )}

          {interState ? (
            <div className="flex justify-between gap-3">
              <dt className="font-semibold text-ink-muted">IGST</dt>
              <dd className="tabular font-bold text-ink-muted">
                {formatMoney(sale.sgst)}
              </dd>
            </div>
          ) : (
            <>
              <div className="flex justify-between gap-3">
                <dt className="font-semibold text-ink-muted">CGST</dt>
                <dd className="tabular font-bold text-ink-muted">
                  {formatMoney(sale.cgst)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="font-semibold text-ink-muted">SGST</dt>
                <dd className="tabular font-bold text-ink-muted">
                  {formatMoney(sale.sgst)}
                </dd>
              </div>
            </>
          )}

          {sale.roundOff !== 0 && (
            <div className="flex justify-between gap-3">
              <dt className="font-semibold text-ink-faint">Round off</dt>
              <dd className="tabular font-bold text-ink-faint">
                {formatMoney(sale.roundOff)}
              </dd>
            </div>
          )}

          <div className="neu-inset mt-3 flex items-baseline justify-between px-4 py-3">
            <dt className="font-display text-base font-bold text-ink">Total</dt>
            <dd className="tabular font-display text-2xl font-bold text-brand">
              {formatMoney(sale.total)}
            </dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-3">
          <div className="neu-inset-sm px-4 py-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-muted">
              Your profit
            </p>
            <p className="tabular mt-1 font-display text-lg font-bold text-success">
              {formatMoney(profit)}
            </p>
          </div>
          <div className="neu-inset-sm px-4 py-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-muted">
              GST owed
            </p>
            <p className="tabular mt-1 font-display text-lg font-bold text-notice">
              {formatMoney(sale.cgst + sale.sgst)}
            </p>
          </div>
        </div>

        {sale.note && <Notice tone="brand">{sale.note}</Notice>}

        <p className="text-xs font-medium text-ink-faint">
          Bills cannot be edited once saved — a GST invoice that has been issued
          is a legal document. Record a correcting bill instead.
        </p>
      </div>
    </Modal>
  );
}
