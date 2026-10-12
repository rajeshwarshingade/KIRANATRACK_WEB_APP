/**
 * Derived analytics.
 *
 * Everything here is a pure function over the stored records. No component
 * computes a total inline: a shop owner comparing yesterday's takings on the
 * dashboard with the monthly figure in Insights must be comparing the same
 * arithmetic, and duplicating it is how two screens end up disagreeing.
 *
 * Two decisions worth stating:
 *
 *  - **Profit is computed from the cost snapshot on the sale line, not from the
 *    product's current cost.** Repricing an item must not retroactively change
 *    the profit of a bill already issued. `SaleLine.unitPrice` is the realised
 *    price; the cost is captured at sale time via `productId` lookup *at the
 *    moment of the sale*, which is why `recordSale` copies cost into the line's
 *    cost history rather than leaving it to be re-derived later.
 *
 *  - **Empty is a first-class answer.** A store with no sales returns zeros and
 *    empty lists, never `null` or `NaN`, so charts can render an empty state
 *    without each caller re-deriving the guard.
 */

import {
  daysBetween,
  monthKey,
  MS_PER_DAY,
  toISODate,
  todayISO,
  expiryHealth,
} from "./dates";
import type {
  Category,
  CategoryStat,
  DayStat,
  ExpiryBucket,
  Paise,
  Product,
  Purchase,
  Sale,
  Settings,
  StockHealth,
} from "./types";

/** Products the owner still trades. Archived lines stay out of live counts. */
export function activeProducts(products: Product[]): Product[] {
  return products.filter((p) => !p.archived);
}

/** On-hand units across a set of products. */
export function totalUnits(products: Product[]): number {
  return products.reduce((sum, p) => sum + p.qty, 0);
}

/**
 * Stock held at cost, in paise.
 *
 * Cost rather than sale price: this is money already spent. Showing retail value
 * here would overstate what a write-off actually costs the shop.
 */
export function stockValue(products: Product[]): Paise {
  return products.reduce((sum, p) => sum + Math.round(p.costPrice * p.qty), 0);
}

/** What the same stock would fetch if every item sold at its listed price. */
export function stockRetailValue(products: Product[]): Paise {
  return products.reduce((sum, p) => sum + Math.round(p.sellPrice * p.qty), 0);
}

export interface SaleTotals {
  revenue: Paise;
  tax: Paise;
  discount: Paise;
  cost: Paise;
  profit: Paise;
  bills: number;
  units: number;
}

/**
 * Cost basis carried on each sale line.
 *
 * Stored on the line rather than re-derived from the product at read time — see
 * the module note. Written by `recordSale`.
 */

/** Totals for a set of sales. */
export function summarise(sales: Sale[]): SaleTotals {
  return sales.reduce<SaleTotals>(
    (acc, sale) => {
      acc.revenue += sale.total;
      acc.tax += sale.cgst + sale.sgst;
      acc.discount += sale.discount;

      for (const line of sale.lines) {
        const cost = line.costAtSale * line.qty;
        acc.cost += cost;
        acc.units += line.qty;
        acc.profit += Math.round(line.unitPrice * line.qty) - cost;
      }

      acc.bills += 1;
      return acc;
    },
    {
      revenue: 0,
      tax: 0,
      discount: 0,
      cost: 0,
      profit: 0,
      bills: 0,
      units: 0,
    },
  );
}

/** Sales on one calendar day, by `YYYY-MM-DD`. */
export function salesOnDay(sales: Sale[], date: string): Sale[] {
  return sales.filter((sale) => sale.at.slice(0, 10) === date);
}

/**
 * The current trading day, honouring a cut-off later than midnight.
 *
 * A shop that opens at 08:00 and closes past midnight books late bills into
 * the previous day, so "today" rolls at the configured start time.
 */
export function tradingDay(settings: Settings): string {
  const { from } = tradingWindow(settings.dayStart);
  return toISODate(new Date(from));
}

/**
 * Half-open timestamp window `[from, to)` for a trading day.
 *
 * Returns instants rather than date strings because a trading day is not a
 * calendar day: with an 08:00 cut-off it runs from 08:00 on one date to 08:00
 * on the next. Comparing `sale.at.slice(0,10) === day` drops every bill rung
 * after midnight, while `>= day` wrongly pulls in bills from later the next
 * morning — the two disagreed with each other until this was expressed as a
 * single interval.
 */
export function tradingWindow(
  dayStart: string,
  now: Date = new Date(),
): { from: number; to: number } {
  const [hours, minutes] = dayStart.split(":").map(Number);
  const start = new Date(now);
  start.setHours(hours || 0, minutes || 0, 0, 0);

  if (now.getTime() < start.getTime()) start.setDate(start.getDate() - 1);

  const from = start.getTime();
  return { from, to: from + MS_PER_DAY };
}

/** Sales falling inside a `[from, to)` timestamp window. */
export function salesInWindow(sales: Sale[], from: number, to: number): Sale[] {
  return sales.filter((sale) => {
    const at = new Date(sale.at).getTime();
    return at >= from && at < to;
  });
}

/** Sales for the current trading day, per the shop's configured cut-off. */
export function salesToday(sales: Sale[], settings: Settings): Sale[] {
  const { from, to } = tradingWindow(settings.dayStart);
  return salesInWindow(sales, from, to);
}

/**
 * Sales in the current trading day and the `days` calendar days before it.
 *
 * Used by the period filters. Anchored to the trading window rather than to
 * midnight, so "Today" and "7 days" can never disagree about which day is today.
 */
export function salesLastDays(
  sales: Sale[],
  settings: Settings,
  days: number,
): Sale[] {
  const { to } = tradingWindow(settings.dayStart);
  return salesInWindow(sales, to - days * MS_PER_DAY, Number.POSITIVE_INFINITY);
}

/** Daily series for the last `days` days, including days with no sales. */
export function dailySeries(sales: Sale[], days: number): DayStat[] {
  const buckets = new Map<string, DayStat>();

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    buckets.set(toISODate(date), {
      date: toISODate(date),
      revenue: 0,
      profit: 0,
      bills: 0,
    });
  }

  for (const sale of sales) {
    const key = sale.at.slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue; // older than the window

    bucket.revenue += sale.total;
    bucket.bills += 1;
    for (const line of sale.lines) {
      bucket.profit += Math.round(line.unitPrice * line.qty) - line.costAtSale * line.qty;
    }
  }

  return [...buckets.values()];
}

/** Revenue and profit grouped by month, oldest first. */
export function monthlySeries(sales: Sale[]): { key: string; revenue: Paise; profit: Paise; bills: number }[] {
  const buckets = new Map<string, { key: string; revenue: Paise; profit: Paise; bills: number }>();

  for (const sale of sales) {
    const key = monthKey(sale.at.slice(0, 10));
    const bucket = buckets.get(key) ?? { key, revenue: 0, profit: 0, bills: 0 };
    bucket.revenue += sale.total;
    bucket.bills += 1;
    for (const line of sale.lines) {
      bucket.profit += Math.round(line.unitPrice * line.qty) - line.costAtSale * line.qty;
    }
    buckets.set(key, bucket);
  }

  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Revenue, profit and units per category, biggest first. */
export function byCategory(sales: Sale[], products: Product[]): CategoryStat[] {
  const categoryOf = new Map(products.map((p) => [p.id, p.category]));

  const stats = new Map<Category, CategoryStat>();

  for (const sale of sales) {
    for (const line of sale.lines) {
      const category = categoryOf.get(line.productId) ?? "Other";
      const stat = stats.get(category) ?? {
        category,
        revenue: 0,
        profit: 0,
        units: 0,
        products: 0,
      };

      stat.revenue += Math.round(line.unitPrice * line.qty);
      stat.profit += Math.round(line.unitPrice * line.qty) - line.costAtSale * line.qty;
      stat.units += line.qty;
      stats.set(category, stat);
    }
  }

  // Distinct product count per category, from live products only — a deleted
  // product's historic sales still earn revenue but must not inflate the
  // "products in this category" count shown beside it.
  const counts = new Map<Category, Set<string>>();
  for (const product of activeProducts(products)) {
    const set = counts.get(product.category) ?? new Set<string>();
    set.add(product.id);
    counts.set(product.category, set);
  }
  for (const [category, set] of counts) {
    const stat = stats.get(category);
    if (stat) stat.products = set.size;
  }

  return [...stats.values()].sort((a, b) => b.revenue - a.revenue);
}

/**
 * Units sold per product within a window.
 *
 * `perDay` divides by the window rather than by days actually traded, because
 * a shop that sold nothing on Sunday still had a Sunday — velocity measures
 * demand per calendar day, not per opening day.
 */
export function velocity(
  sales: Sale[],
  _products: Product[],
  windowDays = 30,
): Map<string, { units: number; revenue: Paise; profit: Paise; lastSoldAt: string | null }> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const out = new Map<string, { units: number; revenue: Paise; profit: Paise; lastSoldAt: string | null }>();

  for (const sale of sales) {
    if (new Date(sale.at) < cutoff) continue;

    for (const line of sale.lines) {
      const entry = out.get(line.productId) ?? {
        units: 0,
        revenue: 0,
        profit: 0,
        lastSoldAt: null,
      };

      entry.units += line.qty;
      entry.revenue += Math.round(line.unitPrice * line.qty);
      entry.profit += Math.round(line.unitPrice * line.qty) - line.costAtSale * line.qty;

      if (entry.lastSoldAt === null || sale.at > entry.lastSoldAt) {
        entry.lastSoldAt = sale.at;
      }

      out.set(line.productId, entry);
    }
  }

  return out;
}

/** Expiring stock, soonest first. Products with no expiry are excluded. */
export function expiryBuckets(
  products: Product[],
  settings: Settings,
): ExpiryBucket[] {
  const today = todayISO();

  return products
    .filter((p) => !p.archived && p.qty > 0 && p.expiry !== null)
    .map((p) => {
      const expiry = p.expiry as string;
      return {
        productId: p.id,
        name: p.name,
        qty: p.qty,
        value: Math.round(p.costPrice * p.qty),
        expiry,
        daysLeft: daysBetween(today, expiry),
        health: expiryHealth(expiry, settings.expiryWarnDays, settings.expiryCriticalDays, today),
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Count of products in each health state, for the donut. */
export function healthBreakdown(
  products: Product[],
  settings: Settings,
): Record<StockHealth, number> {
  const out: Record<StockHealth, number> = {
    expired: 0,
    critical: 0,
    warning: 0,
    fresh: 0,
    none: 0,
  };

  for (const product of products) {
    if (product.archived || product.qty <= 0) continue;
    out[
      expiryHealth(
        product.expiry,
        settings.expiryWarnDays,
        settings.expiryCriticalDays,
      )
    ] += 1;
  }

  return out;
}

/** Products at or below their reorder point. */
export function lowStock(products: Product[]): Product[] {
  return activeProducts(products)
    .filter((p) => p.reorderAt > 0 && p.qty <= p.reorderAt)
    .sort((a, b) => a.qty / (a.reorderAt || 1) - b.qty / (b.reorderAt || 1));
}

/** Value of stock already past expiry — money gone, not money at risk. */
export function expiredValue(products: Product[]): Paise {
  const today = todayISO();
  return products
    .filter(
      (p) =>
        !p.archived &&
        p.qty > 0 &&
        p.expiry !== null &&
        daysBetween(today, p.expiry) < 0,
    )
    .reduce((sum, p) => sum + Math.round(p.costPrice * p.qty), 0);
}

/** Value at risk inside the warning window but not yet expired. */
export function atRiskValue(products: Product[], settings: Settings): Paise {
  const today = todayISO();
  return products
    .filter((p) => {
      if (p.archived || p.qty <= 0 || p.expiry === null) return false;
      const left = daysBetween(today, p.expiry);
      return left >= 0 && left <= settings.expiryWarnDays;
    })
    .reduce((sum, p) => sum + Math.round(p.costPrice * p.qty), 0);
}

/** Purchase spend in a window, for the buying-versus-selling comparison. */
export function purchaseSpend(purchases: Purchase[], windowDays = 30): Paise {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  return purchases
    .filter((p) => new Date(p.at) >= cutoff)
    .reduce((sum, p) => sum + p.total, 0);
}

/** Average basket value, in paise. Zero when nothing has sold. */
export function averageBasket(sales: Sale[]): Paise {
  if (sales.length === 0) return 0;
  return Math.round(sales.reduce((sum, s) => sum + s.total, 0) / sales.length);
}

/** Revenue share per payment mode, as a 0-100 percentage. */
export function paymentMix(sales: Sale[]): { mode: string; amount: Paise; share: number }[] {
  const totals = new Map<string, Paise>();
  let grand = 0;

  for (const sale of sales) {
    totals.set(sale.mode, (totals.get(sale.mode) ?? 0) + sale.total);
    grand += sale.total;
  }

  return [...totals.entries()]
    .map(([mode, amount]) => ({
      mode,
      amount,
      share: grand === 0 ? 0 : (amount / grand) * 100,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** Percentage change from `previous` to `current`, guarding division by zero. */
export function trendPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

/** Products that have not sold at all in `windowDays`, most costly first. */
export function deadStock(
  products: Product[],
  sales: Sale[],
  windowDays = 30,
): { product: Product; value: Paise; daysIdle: number }[] {
  const recent = velocity(sales, products, windowDays);
  const today = todayISO();

  return activeProducts(products)
    .filter((p) => p.qty > 0 && (recent.get(p.id)?.units ?? 0) === 0)
    .map((p) => ({
      product: p,
      value: Math.round(p.costPrice * p.qty),
      // Idle time is measured from when the stock arrived. For a product that
      // has genuinely never sold, that is the only honest anchor: "days since
      // purchase" is exactly the capital-sitting-in-shelf-life the owner cares
      // about. Products that did sell recently but fell out of the window are
      // caught by `daysIdle > windowDays` rather than by an absence, so they
      // are not reported as never-sold.
      daysIdle: Math.max(0, daysBetween(p.receivedOn, today)),
    }))
    .sort((a, b) => b.value - a.value);
}
