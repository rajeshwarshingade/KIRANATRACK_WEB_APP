/**
 * The offline advisor.
 *
 * This is the part of "AI business help" that is genuinely worth shipping: a
 * deterministic analyst that reads the shop's own numbers and produces ranked,
 * quantified, actionable advice. It runs with no network, no key and no cost,
 * which is the only way advice stays available on a shop counter connection.
 *
 * Design rules:
 *
 *  1. **Every insight carries money.** "Your margins are low" is not advice. "Rice
 *     is priced at 4% margin against 9% for comparable staples — repricing to
 *     ₹54 recovers ~₹310/month" is. An insight that cannot name a rupee impact
 *     is only emitted when it is genuinely about something other than money
 *     (e.g. an expiring batch that must be pulled regardless).
 *
 *  2. **Every insight is falsifiable.** Confidence reflects how much evidence
 *     stands behind it — a 3-week sales history supports a weaker claim than a
 *     3-month one. A confident-sounding insight derived from two data points is
 *     worse than no insight, because the owner acts on it.
 *
 *  3. **Actions are typed, not stringly.** `AdvisorAction` is a discriminated
 *     union so "apply this" is a type-checked operation with real arithmetic,
 *     not a string the UI has to parse.
 *
 *  4. **Silence is a valid answer.** With three products and one sale, most
 *     rules correctly produce nothing. Padding the panel with generic advice to
 *     look clever is the failure mode this design exists to avoid.
 */

import {
  activeProducts,
  averageBasket,
  deadStock,
  expiryBuckets,
  paymentMix,
  stockValue,
  summarise,
  trendPct,
  velocity,
} from "./analytics";
import { todayISO } from "./dates";
import type {
  AdvisorInsight,
  Product,
  Purchase,
  Sale,
  Settings,
} from "./types";

/** Days of cover a shop wants on a fast line before ordering again. */
const LEAD_TIME_DAYS = 7;

export interface AdvisorInput {
  products: Product[];
  sales: Sale[];
  purchases: Purchase[];
  settings: Settings;
}

/**
 * Run every rule and return the insights worth showing, worst first.
 *
 * `limit` caps the panel. The rules are ordered by severity and impact before
 * the cap, so trimming drops the least urgent advice rather than an arbitrary
 * slice.
 */
export function analyse(input: AdvisorInput, limit = 8): AdvisorInsight[] {
  const insights: AdvisorInsight[] = [
    ...expiryRules(input),
    ...reorderRules(input),
    ...pricingRules(input),
    ...demandRules(input),
    ...cashRules(input),
  ];

  const weight: Record<AdvisorInsight["severity"], number> = {
    critical: 0,
    warning: 1,
    info: 2,
    positive: 3,
  };

  return insights
    .sort((a, b) => {
      const bySeverity = weight[a.severity] - weight[b.severity];
      if (bySeverity !== 0) return bySeverity;
      // Within a severity, bigger money first.
      return (b.impact ?? 0) - (a.impact ?? 0);
    })
    .slice(0, limit);
}

/* ==========================================================================
   Rule 1 — Expiry. The whole reason this app exists.
   ========================================================================== */

function expiryRules({ products, settings }: AdvisorInput): AdvisorInsight[] {
  const buckets = expiryBuckets(products, settings);
  const out: AdvisorInsight[] = [];

  const expired = buckets.filter((b) => b.health === "expired");
  const expiredValue = expired.reduce((sum, b) => sum + b.value, 0);

  if (expired.length > 0) {
    const units = expired.reduce((sum, b) => sum + b.qty, 0);
    out.push({
      id: "expired-batch",
      severity: "critical",
      category: "expiry",
      title: `${units} units across ${expired.length} ${expired.length === 1 ? "line" : "lines"} are past expiry`,
      detail:
        "This stock cannot be sold. Remove it from the shelf now, write it off, and ask your supplier about a return — many FMCG distributors accept unsold near-expiry returns, which is worth checking before it becomes a total loss.",
      impact: expiredValue,
      actionLabel: "Write off the first",
      action: { kind: "writeOff", productId: expired[0].productId, qty: expired[0].qty },
      // Loss is certain, so confidence is high regardless of volume.
      confidence: 95,
    });
  }

  // Markdown ladder: the closer to expiry, the deeper the suggested cut. This
  // is the discount a shop would actually apply, and it scales to a loss smaller
  // than the cost of the stock.
  /*
   * Markdown ladder.
   *
   * The suggested discount is bounded by each item's own margin, which is the
   * part that matters and the part a flat ladder gets wrong. A 40% markdown on
   * milk sold at ₹66 with a cost of ₹54 clears at ₹39.60 — that is a *loss* of
   * ₹14.40 on a batch the owner is trying to rescue. The deepest safe cut is
   * therefore `1 - cost/sell`, and the recommendation is the largest rung that
   * is still safe for every line in the group.
   */
  const ladder: { max: number; pct: number; when: string }[] = [
    { max: 7, pct: 40, when: "this week" },
    { max: 15, pct: 25, when: "next fortnight" },
    { max: 30, pct: 15, when: "this month" },
  ];

  const productById = new Map(products.map((p) => [p.id, p]));

  for (const step of ladder) {
    const atRisk = buckets.filter(
      (b) => b.health !== "expired" && b.daysLeft >= 0 && b.daysLeft <= step.max,
    );
    if (atRisk.length === 0) continue;

    const cost = atRisk.reduce((sum, b) => sum + b.value, 0);
    const names = atRisk
      .slice(0, 3)
      .map((b) => b.name)
      .join(", ");

    /*
     * The deepest markdown that still clears at or above cost, per line. The
     * group's recommendation is the smallest of these, because a cut that is
     * safe for one item can still lose money on another in the same batch.
     */
    const safePct = atRisk.reduce((limit, bucket) => {
      const product = productById.get(bucket.productId);
      if (!product || product.sellPrice <= 0) return Math.min(limit, 0);

      const headroom = Math.max(0, 1 - product.costPrice / product.sellPrice);
      return Math.min(limit, Math.floor(headroom * 100));
    }, step.pct);

    /*
     * What the cut actually recovers, against the alternative of writing the
     * stock off. `recovered` is revenue at the discounted price. It is reported
     * alongside the cost already sunk rather than as a percentage of it — a
     * markdown does not return a share of the cost, it returns the sale price.
     */
    const recovered = atRisk.reduce((sum, bucket) => {
      const product = productById.get(bucket.productId);
      if (!product) return sum;
      return sum + Math.round(product.sellPrice * bucket.qty * (1 - safePct / 100));
    }, 0);

    const aboveCost = safePct >= step.pct;

    out.push({
      id: `expiry-${step.max}`,
      severity: step.max <= 7 ? "critical" : "warning",
      category: "expiry",
      title: `${atRisk.length} ${atRisk.length === 1 ? "line expires" : "lines expire"} within ${step.max} days`,
      detail:
        `${names}${atRisk.length > 3 ? ` and ${atRisk.length - 3} more` : ""}. ` +
        (aboveCost
          ? `A ${safePct}% markdown ${step.when} still clears above what you paid, and brings back about ₹${(recovered / 100).toFixed(0)} against ₹${(cost / 100).toFixed(0)} of stock that is otherwise worth nothing.`
          : `These lines are priced too close to cost for a discount to rescue them — a ${step.pct}% cut would sell below what you paid. Clearing at ₹${(recovered / 100).toFixed(0)} (vs ₹${(cost / 100).toFixed(0)} of stock) is still better than writing it off, but the real fix is not to buy this much of it again.`),
      // The money genuinely at stake is the full cost of the at-risk stock —
      // that is what is lost if nothing is done, and it is deliberately NOT
      // softened to the recoverable amount.
      impact: cost,
      actionLabel: `Mark down ${safePct}%`,
      // `safePct` is already bounded by each line's headroom, and `changePrice`
      // floors at cost as a second guard, so this can never apply a
      // loss-making cut.
      action: { kind: "markdown", productId: atRisk[0].productId, pct: safePct },
      confidence: aboveCost ? 80 : 70,
    });

    // One ladder rung per horizon; deeper rungs repeat the same stock.
    break;
  }

  return out;
}

/* ==========================================================================
   Rule 2 — Reorder, driven by measured sales velocity.
   ========================================================================== */

function reorderRules({ products, sales }: AdvisorInput): AdvisorInsight[] {
  const window = 30;
  const vel = velocity(sales, products, window);
  const out: AdvisorInsight[] = [];

  // Out of stock but still selling — the most expensive mistake in a shop.
  const stockouts = activeProducts(products).filter(
    (p) => p.qty <= 0 && (vel.get(p.id)?.units ?? 0) >= 3,
  );

  if (stockouts.length > 0) {
    const names = stockouts.slice(0, 3).map((p) => p.name).join(", ");
    const lostPerDay = stockouts.reduce(
      (sum, p) => sum + (vel.get(p.id)?.units ?? 0),
      0,
    );

    out.push({
      id: "stockout-fast",
      severity: "critical",
      category: "reorder",
      title: `${stockouts.length} fast-selling ${stockouts.length === 1 ? "line is" : "lines are"} out of stock`,
      detail: `${names}. These sold ${lostPerDay} units in the last 30 days and you have none on the shelf. Every day they stay empty, customers walk to the next shop — that is usually the habit you lose, not just the sale.`,
      impact: stockouts.reduce(
        (sum, p) => sum + Math.round((vel.get(p.id)?.units ?? 0) * p.sellPrice),
        0,
      ),
      actionLabel: "Restock the top item",
      action: (() => {
        const top = [...stockouts].sort(
          (a, b) => (vel.get(b.id)?.units ?? 0) - (vel.get(a.id)?.units ?? 0),
        )[0];
        return { kind: "restock" as const, productId: top.id, qty: orderQuantity(top, vel.get(top.id)?.units ?? 0, window) };
      })(),
      confidence: 88,
    });
  }

  // Approaching the reorder point on a proven seller.
  const low = activeProducts(products).filter((p) => {
    if (p.qty <= 0 || p.reorderAt <= 0) return false;
    const units = vel.get(p.id)?.units ?? 0;
    return p.qty <= p.reorderAt && units >= 3;
  });

  if (low.length > 0) {
    const total = low.reduce(
      (sum, p) => sum + orderQuantity(p, vel.get(p.id)?.units ?? 0, window),
      0,
    );
    const names = low
      .slice(0, 3)
      .map((p) => p.name)
      .join(", ");

    out.push({
      id: "low-stock",
      severity: "warning",
      category: "reorder",
      title: `${low.length} proven ${low.length === 1 ? "seller is" : "sellers are"} below the reorder point`,
      detail: `${names}${low.length > 3 ? ` and ${low.length - 3} more` : ""}. Based on what each actually sold over 30 days, ordering about ${total} units covers the next week without tying up cash in slow lines.`,
      impact: Math.round(
        low.reduce((sum, p) => sum + orderQuantity(p, vel.get(p.id)?.units ?? 0, window) * p.costPrice, 0),
      ),
      actionLabel: "Add to a purchase",
      action: (() => {
        const top = [...low].sort(
          (a, b) => (vel.get(b.id)?.units ?? 0) - (vel.get(a.id)?.units ?? 0),
        )[0];
        return { kind: "restock" as const, productId: top.id, qty: orderQuantity(top, vel.get(top.id)?.units ?? 0, window) };
      })(),
      confidence: 75,
    });
  }

  return out;
}

/**
 * Suggested order quantity: enough to cover the lead time plus a margin of
 * error, minus what is already on the shelf.
 *
 * Capped so a single anomaly week (a festival, a bulk order to one customer)
 * cannot generate a recommendation to buy 400 units of anything.
 */
function orderQuantity(product: Product, unitsInWindow: number, windowDays: number): number {
  const perDay = unitsInWindow / windowDays;
  // 1.5x lead-time demand covers the lead time and still lands above zero if
  // one delivery slips by a few days.
  const target = Math.ceil(perDay * LEAD_TIME_DAYS * 1.5);
  const need = Math.max(0, target - product.qty);
  return Math.min(need, Math.ceil(perDay * 30));
}

/* ==========================================================================
   Rule 3 — Pricing, dead stock and margin leaks.
   ========================================================================== */

function pricingRules({ products, sales }: AdvisorInput): AdvisorInsight[] {
  const out: AdvisorInsight[] = [];
  const live = activeProducts(products);

  // Dead stock: capital sitting on a shelf that is not moving.
  const dead = deadStock(products, sales, 30).filter((d) => d.daysIdle > 45);

  if (dead.length > 0) {
    const tied = dead.reduce((sum, d) => sum + d.value, 0);
    const top = dead[0];

    out.push({
      id: "dead-stock",
      severity: "warning",
      category: "deadstock",
      title: `₹${(tied / 100).toLocaleString("en-IN")} is sitting still in ${dead.length} ${dead.length === 1 ? "line" : "lines"}`,
      detail: `${top.product.name} has not moved in ${Math.floor(top.daysIdle / 30)} month${top.daysIdle >= 60 ? "s" : ""} and is holding ₹${(top.value / 100).toLocaleString("en-IN")}. Bundle it with a fast mover rather than discounting it alone — a ₹10 packet draws people in, and they leave buying the profitable item too.`,
      impact: tied,
      actionLabel: "Mark down 20%",
      action: { kind: "markdown", productId: top.product.id, pct: 20 },
      confidence: 70,
    });
  }

  // Margin leaks: priced well below what comparable lines in the same category
  // achieve. Only flagged with enough peers to be a real comparison.
  const byCategory = new Map<string, Product[]>();
  for (const p of live) {
    if (p.sellPrice <= p.costPrice) continue; // below cost is handled separately
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  const leaks: { product: Product; median: number; margin: number }[] = [];

  for (const list of byCategory.values()) {
    if (list.length < 4) continue; // too few peers for a fair comparison

    const margins = list
      .map((p) => ((p.sellPrice - p.costPrice) / p.sellPrice) * 100)
      .sort((a, b) => a - b);
    const median = margins[Math.floor(margins.length / 2)];

    for (const p of list) {
      const margin = ((p.sellPrice - p.costPrice) / p.sellPrice) * 100;
      // Only surface a meaningful gap; 1-2% is within normal pricing noise.
      if (margin < median - 5) leaks.push({ product: p, median, margin });
    }
  }

  if (leaks.length > 0) {
    const worst = leaks.sort((a, b) => a.margin - b.margin)[0];
    const gap = worst.median - worst.margin;
    const proposed = Math.round(worst.product.sellPrice * (1 + gap / 100));

    // Recovery assumes the line keeps moving; a price rise of this size usually
    // costs a little volume, so the projection is deliberately conservative.
    const monthlyUnits = velocity(sales, products, 30).get(worst.product.id)?.units ?? 0;
    const monthlyImpact = Math.round(
      (proposed - worst.product.sellPrice) * Math.min(monthlyUnits, 60),
    );

    if (monthlyImpact > 100) {
      out.push({
        id: "margin-leak",
        severity: "info",
        category: "margin",
        title: `${worst.product.name} is priced ${gap.toFixed(1)}% below its category`,
        detail: `Most ${worst.product.category.toLowerCase()} lines in your shop run near ${worst.median.toFixed(0)}% margin; this one is on ${worst.margin.toFixed(0)}%. Moving it to ₹${(proposed / 100).toFixed(2)} puts it in line with the rest.`,
        impact: monthlyImpact,
        actionLabel: "Reprice it",
        action: {
          kind: "markdown",
          productId: worst.product.id,
          pct: Math.round((worst.product.sellPrice - proposed) / worst.product.sellPrice * 100),
        },
        confidence: 55,
      });
    }
  }

  // Items priced below cost: an outright mistake rather than a pricing choice.
  const belowCost = live.filter((p) => p.sellPrice < p.costPrice && p.qty > 0);

  if (belowCost.length > 0) {
    const loss = belowCost.reduce(
      (sum, p) => sum + Math.round((p.costPrice - p.sellPrice) * p.qty),
      0,
    );

    out.push({
      id: "below-cost",
      severity: "warning",
      category: "pricing",
      title: `${belowCost.length} ${belowCost.length === 1 ? "line sells" : "lines sell"} below cost`,
      detail: `${belowCost[0].name} and ${belowCost.length - 1} other${belowCost.length > 2 ? "s" : ""} ${belowCost.length > 2 ? "are" : "is"} priced under what you paid. Each one sold loses money before a single rupee of rent — check whether these are clearance lines you meant to discount, or a pricing slip.`,
      impact: loss,
      actionLabel: "Review the first",
      action: null,
      confidence: 90,
    });
  }

  return out;
}

/* ==========================================================================
   Rule 4 — Demand: what actually sells, and when.
   ========================================================================== */

function demandRules({ products, sales }: AdvisorInput): AdvisorInsight[] {
  const out: AdvisorInsight[] = [];
  if (sales.length < 5) return out;

  // Day-of-week pattern. A shop that restocks on Sunday when Sunday is its
  // quietest day runs out on Saturday — the busiest.
  const byWeekday = new Map<number, number>();
  for (const sale of sales) {
    const day = new Date(sale.at).getDay();
    byWeekday.set(day, (byWeekday.get(day) ?? 0) + sale.total);
  }

  if (byWeekday.size >= 5) {
    const ranked = [...byWeekday.entries()].sort((a, b) => b[1] - a[1]);
    const [busyDay, busyTotal] = ranked[0];
    const average = ranked.reduce((sum, [, v]) => sum + v, 0) / ranked.length;

    // Only worth saying when the gap is real, not weekday noise.
    if (average > 0 && busyTotal / average > 1.4) {
      const name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][busyDay];
      const lift = Math.round(((busyTotal - average) / average) * 100);

      out.push({
        id: "busy-day",
        severity: "info",
        category: "demand",
        title: `${name} is your busiest day — ${lift}% above average`,
        detail: `Your ${name} takings run about ${lift}% higher than a normal day. Restock by ${["Thursday", "Friday", "Saturday"][busyDay % 3] || "midweek"} rather than on ${name} itself, so the fast movers are already on the shelf when the customers arrive.`,
        impact: busyTotal - average,
        actionLabel: null,
        action: null,
        // A modest lift on a small sample is suggestive, not conclusive.
        confidence: sales.length > 30 ? 65 : 40,
      });
    }
  }

  // High-margin heroes: lines earning outsized profit share. Reinforcing a
  // winner is as valuable as fixing a loser.
  const stats = summarise(sales);
  if (stats.profit > 0) {
    const vel = velocity(sales, products, 30);
    const productById = new Map(products.map((p) => [p.id, p]));

    const heroes = [...vel.entries()]
      .map(([id, v]) => ({ product: productById.get(id), ...v }))
      .filter((h): h is typeof h & { product: Product } => Boolean(h.product))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 3);

    if (heroes.length === 3 && heroes[0].profit > 0) {
      const share = (heroes[0].profit / stats.profit) * 100;
      if (share > 30) {
        out.push({
          id: "hero-product",
          severity: "positive",
          category: "margin",
          title: `${heroes[0].product.name} is ${Math.round(share)}% of your profit`,
          detail: `It sold ${heroes[0].units} units in 30 days at ${(((heroes[0].product.sellPrice - heroes[0].product.costPrice) / heroes[0].product.sellPrice) * 100).toFixed(0)}% margin. Keep it on the shelf — and give it shelf space at eye level, not buried. A stall owner will stock what sells, and this is what sells.`,
          impact: heroes[0].profit,
          actionLabel: null,
          action: null,
          confidence: 85,
        });
      }
    }
  }

  return out;
}

/* ==========================================================================
   Rule 5 — Cash: what the day actually looked like.
   ========================================================================== */

function cashRules({ sales, products }: AdvisorInput): AdvisorInsight[] {
  const out: AdvisorInsight[] = [];
  const today = todayISO();
  const yesterday = addDaysLocal(today, -1);

  const todays = sales.filter((s) => s.at.slice(0, 10) === today);
  const stats = summarise(todays);
  const yesterdayStats = summarise(
    sales.filter((s) => s.at.slice(0, 10) === yesterday),
  );

  // Only meaningful once the shop has actually traded both days — comparing a
  // full day against an empty one would report a spectacular rise every
  // morning and a crash every night.
  if (yesterdayStats.bills > 0) {
    const change = trendPct(stats.revenue, yesterdayStats.revenue);
    const delta = stats.revenue - yesterdayStats.revenue;

    if (change !== null && Math.abs(change) >= 25) {
      out.push({
        id: "today-vs-yesterday",
        severity: change > 0 ? "positive" : "info",
        category: "demand",
        title: change > 0
          ? `Takings are ${Math.abs(Math.round(change))}% up on yesterday`
          : `Takings are ${Math.abs(Math.round(change))}% down on yesterday`,
        detail:
          change > 0
            ? `₹${(stats.revenue / 100).toLocaleString("en-IN")} so far across ${stats.bills} ${stats.bills === 1 ? "bill" : "bills"}. Worth noting what you had stocked today, in case it is worth repeating.`
            : `₹${(stats.revenue / 100).toLocaleString("en-IN")} so far across ${stats.bills} ${stats.bills === 1 ? "bill" : "bills"}. A slow day is very often a stock-out day — check whether something you usually sells is missing, rather than assuming demand dropped.`,
        impact: Math.abs(delta),
        actionLabel: null,
        action: null,
        confidence: 60,
      });
    }
  }

  // Credit exposure. Udhaar is real money lent, and in a neighbourhood shop it
  // is the first thing to quietly become unrecoverable.
  const credit = todays.filter((s) => s.mode === "credit");
  if (credit.length >= 2) {
    const owed = credit.reduce((sum, s) => sum + s.total, 0);
    out.push({
      id: "credit-today",
      severity: "info",
      category: "cash",
      title: `₹${(owed / 100).toLocaleString("en-IN")} went on credit today`,
      detail: `${credit.length} bills on udhaar. Keep the amounts in one notebook or one app — in a neighbourhood shop the loss is almost never the amount, it is forgetting who owes what until the customer has moved away.`,
      impact: owed,
      actionLabel: null,
      action: null,
      confidence: 80,
    });
  }

  // Cash on the shelf relative to the day's typical takings.
  const avgBasket = averageBasket(sales);
  if (avgBasket > 0) {
    const liquid = todays
      .filter((s) => s.mode === "cash" || s.mode === "upi")
      .reduce((sum, s) => sum + s.total, 0);
    const held = stockValue(products);

    // Only meaningful when stock genuinely dwarfs the trading rate.
    if (held > 0 && liquid >= 0) {
      const daysOfStock = held / Math.max(avgBasket, 1);
      if (daysOfStock > 45) {
        out.push({
          id: "overstocked",
          severity: "info",
          category: "cash",
          title: `Stock holds about ${Math.round(daysOfStock)} days of trade`,
          detail: `₹${(held / 100).toLocaleString("en-IN")} of stock against average bills of ₹${(avgBasket / 100).toFixed(0)}. Money sitting in unsold stock cannot pay the rent. Trim the slowest lines first — the advisor above lists them by value.`,
          impact: held,
          actionLabel: null,
          action: null,
          confidence: 50,
        });
      }
    }
  }

  // Payment mix shift, when there is enough history to see it.
  if (sales.length > 20) {
    const mix = paymentMix(sales);
    const upi = mix.find((m) => m.mode === "upi");
    if (upi && upi.share > 0 && upi.share < 15) {
      out.push({
        id: "low-digital",
        severity: "info",
        category: "cash",
        title: `Only ${upi.share.toFixed(0)}% of your takings are digital`,
        detail: `Cash handling costs time at the counter and risks counterfeit notes. Accepting UPI costs nothing and settles instantly — most shops that switch report the counter getting noticeably faster within a week.`,
        impact: null,
        actionLabel: null,
        action: null,
        confidence: 45,
      });
    }
  }

  return out;
}

/* ==========================================================================
   Helpers
   ========================================================================== */

/**
 * Local date arithmetic for a single call site.
 *
 * Builds through `Date.UTC` so the result is a calendar-day shift that cannot
 * be pulled off by a daylight-saving boundary in the reader's timezone.
 */
function addDaysLocal(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d + days));
  return probe.toISOString().slice(0, 10);
}
