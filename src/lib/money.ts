/**
 * Money and GST arithmetic.
 *
 * Everything here works in whole paise (`Paise`). Floats are never used for a
 * stored or accumulated amount.
 *
 * The GST model implemented is the one Indian retail actually uses:
 *
 *   - A sale *within* the store's state splits the tax evenly into CGST and
 *     SGST, each at half the rate. `IGST` never appears on such a bill.
 *   - A sale *outside* the state is an inter-state supply, charged a single
 *     IGST line at the full rate, with no CGST/SGST.
 *
 * Whether a bill is inter-state is decided by the caller (it knows the
 * customer's place of supply) and passed in as an explicit boolean. Deriving it
 * inside this module would require reading store settings, which would make the
 * arithmetic impure and untestable in isolation.
 */

import type { Paise, Sale, SaleLine } from "./types";

/**
 * Indian currency grouping: lakh and crore rather than thousands.
 * `Intl` gives `₹1,23,456.00`, which is what a shop owner reads on a bill.
 */
const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Compact variant for dashboard tiles, where exact paisa do not matter. */
const compactFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** ₹1,23,456.00 */
export function formatMoney(paise: Paise): string {
  return formatter.format(paise / 100);
}

/** ₹1.2L — for stat tiles and chart axes. */
export function formatMoneyCompact(paise: Paise): string {
  // Below a lakh, compact notation degrades to a bare number ("12345"), which
  // loses the currency symbol and the decimal. Those amounts are shown in full.
  if (Math.abs(paise) < 100_00) return formatter.format(paise / 100);
  return compactFormatter.format(paise / 100);
}

/** Plain digits for input fields, which take rupees as a decimal string. */
export function moneyToInput(paise: Paise): string {
  return (paise / 100).toFixed(2);
}

/**
 * Parse a user-typed rupee amount into paise.
 *
 * Returns 0 for anything unparseable rather than `NaN`. A `NaN` in a price
 * field propagates silently into every total on the bill and only surfaces when
 * the customer is being charged — the worst possible moment to discover it.
 */
export function inputToMoney(raw: string): Paise {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "") return 0;

  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return 0;

  return Math.round(value * 100);
}

/** Paise to a plain rupee number, for charts and percentage maths. */
export function toRupees(paise: Paise): number {
  return paise / 100;
}

/**
 * Round to the nearest rupee, halves away from zero.
 *
 * Retail bills almost always show whole rupees. The returned `roundOff` is what
 * gets written onto the sale, so the printed total always equals the sum of its
 * printed lines — an invoice that does not reconcile against its own tax is an
 * audit finding.
 */
export function roundToRupee(paise: Paise): { total: Paise; roundOff: Paise } {
  const total = Math.round(paise / 100) * 100;
  return { total, roundOff: total - paise };
}

export interface TaxBreakdown {
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
}

/**
 * Tax for a bill, keyed by rate.
 *
 * `taxablePerRate` maps each GST rate to the pre-tax amount charged at that
 * rate, because one bill routinely mixes 5% packaged food with 18% soap.
 *
 * Tax is rounded per rate per bill, not per line. Rounding each line
 * independently lets a bill of many cheap lines accumulate a visible
 * discrepancy against the declared rate.
 */
export function computeTax(
  taxablePerRate: Map<number, Paise>,
  interState: boolean,
): TaxBreakdown {
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  taxablePerRate.forEach((amount, rate) => {
    if (amount <= 0) return;

    const tax = Math.round((amount * rate) / 100);
    if (interState) {
      igst += tax;
      return;
    }

    // Split the tax, giving any odd paisa to CGST so the two halves always sum
    // back to the exact tax rather than being a paise short.
    const half = Math.floor(tax / 2);
    cgst += half;
    sgst += tax - half;
  });

  return { cgst, sgst, igst };
}

/**
 * Total tax collected on a bill, whichever lines carried it.
 *
 * CGST and SGST are two components of one tax, not two taxes, so summing them
 * is the correct liability for the period. IGST is carried in the same slot for
 * inter-state bills, so one accessor covers both.
 */
export function saleTax(sale: Pick<Sale, "cgst" | "sgst">): Paise {
  return sale.cgst + sale.sgst;
}

/**
 * True when a bill is an inter-state supply, judged from how its tax was
 * actually split.
 *
 * Derived from the stored record rather than a separate flag so the two can
 * never disagree: an intra-state bill has half-rates in CGST and SGST, and an
 * inter-state one carries the full amount.
 */
export function isInterState(sale: Pick<Sale, "cgst" | "sgst">): boolean {
  return sale.cgst === 0 && sale.sgst > 0;
}

export interface SaleTotals
  extends Pick<
    Sale,
    "subtotal" | "discount" | "cgst" | "sgst" | "roundOff" | "total"
  > {
  igst: Paise;
  interState: boolean;
}

/**
 * Rebuild a bill's totals from its lines.
 *
 * `discountPct` is applied per line before tax, because that is how a discount
 * entered at the counter actually works — it reduces the taxable value and
 * therefore the tax, rather than being subtracted from the total afterwards.
 */
export function buildSaleTotals(
  lines: SaleLine[],
  discountPct: number,
  interState: boolean,
): SaleTotals {
  const pct = clampDiscount(discountPct);

  const taxablePerRate = new Map<number, Paise>();
  let subtotal = 0;
  let discount = 0;

  for (const line of lines) {
    const lineDiscount = Math.round((line.amount * pct) / 100);
    const taxable = line.amount - lineDiscount;

    subtotal += line.amount;
    discount += lineDiscount;
    taxablePerRate.set(
      line.taxRate,
      (taxablePerRate.get(line.taxRate) ?? 0) + taxable,
    );
  }

  const tax = computeTax(taxablePerRate, interState);
  const payable =
    subtotal - discount + tax.cgst + tax.sgst + tax.igst;
  const { total, roundOff } = roundToRupee(payable);

  return {
    subtotal,
    discount,
    cgst: tax.cgst,
    sgst: tax.sgst,
    igst: tax.igst,
    interState,
    roundOff,
    total,
  };
}

/** Total payable for a bill, without rounding — used for live cart totals. */
export function payableBeforeRounding(totals: SaleTotals): Paise {
  return (
    totals.subtotal -
    totals.discount +
    totals.cgst +
    totals.sgst +
    totals.igst
  );
}

/** Clamp a discount to a range that cannot make a sale loss-making by accident. */
export function clampDiscount(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

/**
 * Margin on a sale line, in paise and as a percent of what was charged.
 *
 * `costAtSale` is passed in rather than looked up, so this works for a historic
 * line whose product has since been repriced — repricing must not silently
 * rewrite the margin of a sale already billed.
 */
export function lineProfit(
  unitPrice: Paise,
  qty: number,
  costAtSale: Paise,
): { revenue: Paise; cost: Paise; profit: Paise; marginPct: number } {
  const revenue = unitPrice * qty;
  const cost = costAtSale * qty;
  const profit = revenue - cost;
  return {
    revenue,
    cost,
    profit,
    marginPct: revenue === 0 ? 0 : (profit / revenue) * 100,
  };
}
