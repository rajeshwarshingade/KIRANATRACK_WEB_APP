"use client";

/**
 * The store's write layer.
 *
 * Every mutation that changes stock lives here rather than in a component, for
 * one reason: stock is money and history. A sale must, atomically from the
 * owner's point of view, reduce the quantity on hand, capture the cost of what
 * was sold, write an invoice, and leave an audit trail. If any screen were
 * allowed to decrement `qty` on its own, the dashboard and the expiry list
 * would eventually disagree about how much stock exists.
 *
 * Actions are plain functions over `Database` and return a result rather than
 * throwing, because the expected failures here (not enough stock, duplicate
 * SKU) are ordinary operating conditions at a busy counter — not exceptions.
 */

import {
  addDays,
  daysBetween,
  todayISO,
} from "./dates";
import { buildSaleTotals } from "./money";
import { createId } from "./storage";
import type {
  ActivityEvent,
  Database,
  PaymentMode,
  Paise,
  Product,
  Purchase,
  PurchaseLine,
  Sale,
  SaleLine,
  Settings,
} from "./types";

/** Store identity defaults. The owner edits these in Settings. */
export const DEFAULT_SETTINGS: Settings = {
  profile: {
    name: "My Kirana Store",
    owner: "Store Owner",
    phone: "",
    address: "",
    gstin: "",
    // Place of supply defaults to Maharashtra (27), the most common small-store
    // state, so an intra-state GST split is correct out of the box.
    state: "Maharashtra",
    stateCode: "27",
  },
  expiryWarnDays: 14,
  expiryCriticalDays: 3,
  defaultTaxRate: 5,
  dayStart: "08:00",
  lowStockOn: true,
  /**
   * The sample shop is never loaded automatically.
   *
   * Earlier builds seeded it on first open so the charts and the advisor had
   * something to show. A real shop owner installing this finds their own till,
   * and opening onto 1,144 bills they never rang under someone else's shop name
   * is a credibility problem no demo is worth. It stays one tap away in Settings
   * for anyone who wants to look at a full shop first.
   */
  demoDataOn: false,
  ai: { provider: null, apiKey: "", model: "", enabled: false },
};

/**
 * The sample shop's name.
 *
 * Doubles as the fingerprint for "this data is not yours" — see the `isDemo`
 * derivation in `store-context.tsx`. Defined once here so the seed and the
 * detector cannot disagree about what the sample is called.
 */
export const SAMPLE_SHOP_NAME = "Sharma General Store";

export function emptyDatabase(): Database {
  return {
    products: [],
    sales: [],
    purchases: [],
    events: [],
    settings: DEFAULT_SETTINGS,
  };
}

/** Result of an action that can fail for an ordinary, expected reason. */
export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const fail = (message: string): ActionResult => ({ ok: false, message });
const done = (message: string): ActionResult => ({ ok: true, message });

/* ==========================================================================
   Invoice numbering
   ========================================================================== */

/**
 * Next sequential invoice number.
 *
 * Derived from the highest existing number rather than the count, so deleting
 * an old invoice can never hand the same number to two different bills — a
 * duplicate invoice number is a GST filing problem, not a cosmetic one.
 */
export function nextInvoiceNo(sales: Sale[]): string {
  let max = 0;

  for (const sale of sales) {
    const match = /^INV-(\d+)$/.exec(sale.invoiceNo);
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > max) max = value;
  }

  return `INV-${String(max + 1).padStart(4, "0")}`;
}

/** Next supplier bill number for a given supplier. */
export function nextPurchaseBillNo(purchases: Purchase[], supplier: string): string {
  const mine = purchases.filter((p) => p.supplier === supplier);
  return `PO-${String(mine.length + 1).padStart(3, "0")}`;
}

/* ==========================================================================
   Audit trail
   ========================================================================== */

function event(
  kind: ActivityEvent["kind"],
  title: string,
  detail: string,
  valueImpact: Paise | null = null,
): ActivityEvent {
  return {
    id: createId(),
    at: new Date().toISOString(),
    kind,
    title,
    detail,
    valueImpact,
  };
}

/** Events are append-only and capped, so storage cannot grow without bound. */
const MAX_EVENTS = 500;

function appendEvent(db: Database, entry: ActivityEvent): Database["events"] {
  return [entry, ...db.events].slice(0, MAX_EVENTS);
}

/* ==========================================================================
   Products
   ========================================================================== */

export type ProductInput = Omit<
  Product,
  "id" | "createdAt" | "archived"
> & { id?: string };

export function addProduct(db: Database, input: ProductInput): [Database, ActionResult] {
  const name = input.name.trim();

  if (!name) return [db, fail("A product needs a name.")];

  const sku = input.sku.trim();
  if (sku && db.products.some((p) => p.sku.toLowerCase() === sku.toLowerCase())) {
    return [db, fail(`SKU "${sku}" is already used by another product.`)];
  }

  if (input.sellPrice < 0 || input.costPrice < 0) {
    return [db, fail("Prices cannot be negative.")];
  }

  if (input.qty < 0) {
    return [db, fail("Quantity cannot be negative.")];
  }

  const product: Product = {
    ...input,
    id: input.id ?? createId(),
    name,
    sku,
    createdAt: new Date().toISOString(),
    archived: false,
  };

  return [
    {
      ...db,
      products: [...db.products, product],
      events: appendEvent(
        db,
        event(
          "product_add",
          `Added ${name}`,
          `${input.qty} ${input.unit} at ₹${(input.costPrice / 100).toFixed(2)} cost`,
          Math.round(input.costPrice * input.qty),
        ),
      ),
    },
    done(`${name} added.`),
  ];
}

export function updateProduct(
  db: Database,
  id: string,
  changes: Partial<ProductInput>,
): [Database, ActionResult] {
  const existing = db.products.find((p) => p.id === id);
  if (!existing) return [db, fail("That product no longer exists.")];

  if (changes.name !== undefined && !changes.name.trim()) {
    return [db, fail("A product needs a name.")];
  }

  if (changes.sku !== undefined) {
    const sku = changes.sku.trim();
    if (
      sku &&
      db.products.some((p) => p.id !== id && p.sku.toLowerCase() === sku.toLowerCase())
    ) {
      return [db, fail(`SKU "${sku}" is already used by another product.`)];
    }
  }

  // Quantity is deliberately not editable here. Stock only moves through a
  // sale, a purchase or an explicit adjustment, so the audit trail always
  // explains why the number changed.
  const { qty: _ignored, ...safe } = changes as Partial<ProductInput> & { qty?: number };
    void _ignored;

  const next: Product = {
    ...existing,
    ...safe,
    name: safe.name?.trim() ?? existing.name,
    sku: safe.sku?.trim() ?? existing.sku,
  };

  return [
    {
      ...db,
      products: db.products.map((p) => (p.id === id ? next : p)),
      events: appendEvent(db, event("product_edit", `Updated ${next.name}`, "Product details changed")),
    },
    done(`${next.name} updated.`),
  ];
}

/** Archive rather than delete — historic bills still reference the product. */
export function archiveProduct(db: Database, id: string): [Database, ActionResult] {
  const existing = db.products.find((p) => p.id === id);
  if (!existing) return [db, fail("That product no longer exists.")];

  if (existing.qty > 0) {
    return [
      db,
      fail(
        `${existing.name} still has ${existing.qty} in stock. Sell or write it off before removing it.`,
      ),
    ];
  }

  return [
    {
      ...db,
      products: db.products.map((p) => (p.id === id ? { ...p, archived: true } : p)),
      events: appendEvent(db, event("product_delete", `Removed ${existing.name}`, "Product archived")),
    },
    done(`${existing.name} removed.`),
  ];
}

/* ==========================================================================
   Sales — the billing path
   ========================================================================== */

export interface SaleDraft {
  lines: SaleLine[];
  discountPct: number;
  mode: PaymentMode;
  customerName: string;
  customerPhone: string;
  note: string;
  interState: boolean;
}

export type SaleValidation = { ok: true } | { ok: false; message: string };

/**
 * Check a cart before it is billed.
 *
 * Stock is checked per product rather than per line, because the same product
 * can legitimately appear on two lines (different price or a split across
 * batches), and the shelf only has one number on it.
 */
export function validateSale(db: Database, draft: SaleDraft): SaleValidation {
  if (draft.lines.length === 0) {
    return { ok: false, message: "Add at least one item to the bill." };
  }

  const wanted = new Map<string, number>();
  for (const line of draft.lines) {
    wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.qty);
  }

  for (const [productId, qty] of wanted) {
    const product = db.products.find((p) => p.id === productId);
    if (!product) return { ok: false, message: "One of the items is no longer in your catalogue." };
    if (qty > product.qty) {
      return {
        ok: false,
        message: `Only ${product.qty} ${product.unit} of ${product.name} left in stock.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Bill a cart.
 *
 * Stock is decremented here and nowhere else. `costAtSale` is copied onto each
 * line so that repricing the product later cannot rewrite the profit of a bill
 * that has already been issued.
 */
export function recordSale(db: Database, draft: SaleDraft): [Database, ActionResult] {
  const check = validateSale(db, draft);
  if (!check.ok) return [db, fail(check.message)];

  // Capture the cost snapshot before stock changes.
  const costByProduct = new Map(db.products.map((p) => [p.id, p.costPrice]));
  const lines: SaleLine[] = draft.lines.map((line) => ({
    ...line,
    costAtSale: costByProduct.get(line.productId) ?? 0,
    amount: Math.round(line.unitPrice * line.qty),
  }));

  const totals = buildSaleTotals(lines, draft.discountPct, draft.interState);

  const sale: Sale = {
    id: createId(),
    invoiceNo: nextInvoiceNo(db.sales),
    at: new Date().toISOString(),
    lines,
    subtotal: totals.subtotal,
    discount: totals.discount,
    cgst: totals.cgst,
    // An inter-state bill carries IGST in this slot and leaves CGST at zero, so
    // one accessor (`saleTax`) totals the liability for both treatments.
    sgst: totals.interState ? totals.igst : totals.sgst,
    roundOff: totals.roundOff,
    total: totals.total,
    mode: draft.mode,
    customerName: draft.customerName.trim(),
    customerPhone: draft.customerPhone.trim(),
    note: draft.note.trim(),
  };

  // Decrement stock per product, summing across lines.
  const sold = new Map<string, number>();
  for (const line of lines) {
    sold.set(line.productId, (sold.get(line.productId) ?? 0) + line.qty);
  }

  const products = db.products.map((product) => {
    const qty = sold.get(product.id);
    return qty === undefined ? product : { ...product, qty: Math.max(0, product.qty - qty) };
  });

  const units = lines.reduce((sum, l) => sum + l.qty, 0);

  return [
    {
      ...db,
      products,
      sales: [...db.sales, sale],
      events: appendEvent(
        db,
        event(
          "sale",
          `${sale.invoiceNo} · ₹${(sale.total / 100).toLocaleString("en-IN")}`,
          `${units} item${units === 1 ? "" : "s"} · ${sale.mode.toUpperCase()}${
            sale.customerName ? ` · ${sale.customerName}` : ""
          }`,
          sale.total,
        ),
      ),
    },
    done(`${sale.invoiceNo} saved.`),
  ];
}

/* ==========================================================================
   Purchases — restocking
   ========================================================================== */

export interface PurchaseDraft {
  supplier: string;
  lines: PurchaseLine[];
  taxRate: number;
  note: string;
}

export function recordPurchase(db: Database, draft: PurchaseDraft): [Database, ActionResult] {
  if (draft.lines.length === 0) {
    return [db, fail("Add at least one item to the purchase.")];
  }

  if (!draft.supplier.trim()) {
    return [db, fail("Enter the supplier name.")];
  }

  const subtotal = draft.lines.reduce((sum, line) => sum + line.amount, 0);
  const tax = Math.round((subtotal * draft.taxRate) / 100);

  const purchase: Purchase = {
    id: createId(),
    billNo: nextPurchaseBillNo(db.purchases, draft.supplier.trim()),
    at: new Date().toISOString(),
    supplier: draft.supplier.trim(),
    lines: draft.lines,
    subtotal,
    taxRate: draft.taxRate,
    tax,
    total: subtotal + tax,
    note: draft.note.trim(),
  };

  const received = new Map<string, PurchaseLine>();
  for (const line of draft.lines) {
    const existing = received.get(line.productId);
    if (existing) {
      existing.qty += line.qty;
      existing.amount += line.amount;
    } else {
      received.set(line.productId, { ...line });
    }
  }

  // Restocking also refreshes the product's cost, received date and default
  // expiry. A shop buys at today's price, not at whatever it paid last month.
  const products = db.products.map((product) => {
    const line = received.get(product.id);
    if (!line) return product;

    return {
      ...product,
      qty: product.qty + line.qty,
      costPrice: line.unitCost,
      receivedOn: todayISO(),
      reorderAt: product.reorderAt > 0 ? product.reorderAt : Math.max(2, Math.ceil(line.qty / 2)),
    };
  });

  const units = draft.lines.reduce((sum, l) => sum + l.qty, 0);

  return [
    {
      ...db,
      products,
      purchases: [...db.purchases, purchase],
      events: appendEvent(
        db,
        event(
          "purchase",
          `Restock from ${purchase.supplier}`,
          `${units} item${units === 1 ? "" : "s"} · ₹${(purchase.total / 100).toLocaleString("en-IN")}`,
          -purchase.total,
        ),
      ),
    },
    done(`Received ${units} items from ${purchase.supplier}.`),
  ];
}

/* ==========================================================================
   Advisor actions
   ========================================================================== */

/** Write expired or damaged stock off, with an audit entry. */
export function writeOffStock(
  db: Database,
  productId: string,
  qty: number,
  reason: string,
): [Database, ActionResult] {
  const product = db.products.find((p) => p.id === productId);
  if (!product) return [db, fail("That product no longer exists.")];

  if (qty <= 0) return [db, fail("Enter a quantity greater than zero.")];
  if (qty > product.qty) {
    return [db, fail(`Only ${product.qty} in stock to write off.`)];
  }

  const loss = Math.round(product.costPrice * qty);
  const remaining = product.qty - qty;

  return [
    {
      ...db,
      products: db.products.map((p) =>
        p.id === productId ? { ...p, qty: remaining } : p,
      ),
      events: appendEvent(
        db,
        event(
          "stock_adjust",
          `Wrote off ${qty} × ${product.name}`,
          reason || "Manual write-off",
          -loss,
        ),
      ),
    },
    done(`${qty} × ${product.name} written off.`),
  ];
}

/** Set a new expiry date on existing stock. */
export function setExpiry(
  db: Database,
  productId: string,
  expiry: string | null,
): [Database, ActionResult] {
  const product = db.products.find((p) => p.id === productId);
  if (!product) return [db, fail("That product no longer exists.")];

  return [
    {
      ...db,
      products: db.products.map((p) => (p.id === productId ? { ...p, expiry } : p)),
      events: appendEvent(
        db,
        event("stock_adjust", `Expiry updated for ${product.name}`, expiry ?? "Cleared", null),
      ),
    },
    done(`${product.name} expiry updated.`),
  ];
}

/** Set the reorder point for a product. */
export function setReorderPoint(
  db: Database,
  productId: string,
  value: number,
): [Database, ActionResult] {
  const product = db.products.find((p) => p.id === productId);
  if (!product) return [db, fail("That product no longer exists.")];

  return [
    {
      ...db,
      products: db.products.map((p) =>
        p.id === productId ? { ...p, reorderAt: Math.max(0, Math.round(value)) } : p,
      ),
      events: appendEvent(
        db,
        event("stock_adjust", `Reorder point set for ${product.name}`, `${value} ${product.unit}`, null),
      ),
    },
    done(`${product.name} reorder point set to ${value}.`),
  ];
}

/**
 * Apply a price change as a percentage.
 *
 * A markdown is expressed as a reduction, so the new price is always
 * `current * (1 - pct/100)`. Negative percentages (price rises) are accepted
 * because the repricing suggestion uses the same code path to lift a
 * under-priced line back toward its category margin.
 */
export function changePrice(
  db: Database,
  productId: string,
  pct: number,
): [Database, ActionResult] {
  const product = db.products.find((p) => p.id === productId);
  if (!product) return [db, fail("That product no longer exists.")];

  const factor = 1 - pct / 100;
  // Never below cost: a markdown that sells below what you paid is a
  // different decision, and the advisor warns about it separately.
  const floored = Math.max(product.costPrice, Math.round(product.sellPrice * factor));

  return [
    {
      ...db,
      products: db.products.map((p) =>
        p.id === productId ? { ...p, sellPrice: floored } : p,
      ),
      events: appendEvent(
        db,
        event(
          "product_edit",
          `Repriced ${product.name}`,
          `₹${(product.sellPrice / 100).toFixed(2)} → ₹${(floored / 100).toFixed(2)}`,
          null,
        ),
      ),
    },
    done(
      `${product.name} is now ₹${(floored / 100).toFixed(2)}${
        floored === product.costPrice && product.sellPrice > product.costPrice
          ? " — held at cost, not below it."
          : "."
      }`,
    ),
  ];
}

/** Set an absolute selling price. */
export function setPrice(
  db: Database,
  productId: string,
  price: Paise,
): [Database, ActionResult] {
  const product = db.products.find((p) => p.id === productId);
  if (!product) return [db, fail("That product no longer exists.")];

  if (price < 0) return [db, fail("Price cannot be negative.")];

  return [
    {
      ...db,
      products: db.products.map((p) =>
        p.id === productId ? { ...p, sellPrice: price } : p,
      ),
      events: appendEvent(
        db,
        event("product_edit", `Repriced ${product.name}`, `Now ₹${(price / 100).toFixed(2)}`, null),
      ),
    },
    done(`${product.name} is now ₹${(price / 100).toFixed(2)}.`),
  ];
}

/** Update store settings, carrying an audit entry for the change. */
export function updateSettings(
  db: Database,
  changes: Partial<Settings>,
): [Database, ActionResult] {
  return [
    {
      ...db,
      settings: {
        ...db.settings,
        ...changes,
        profile: { ...db.settings.profile, ...(changes.profile ?? {}) },
        ai: { ...db.settings.ai, ...(changes.ai ?? {}) },
      },
      events: appendEvent(db, event("settings", "Settings updated", "Shop configuration changed", null)),
    },
    done("Settings saved."),
  ];
}

/**
 * Clear the activity log.
 *
 * Only the log — products, bills and purchases are untouched, because the log
 * is a history of events rather than a second copy of the data. Kept as a
 * separate action rather than a special case of `clearAllData` so the
 * destructive path is explicit at the call site.
 */
export function clearEventLog(db: Database): [Database, ActionResult] {
  return [
    {
      ...db,
      events: [
        event("settings", "Activity log cleared", "History removed by the owner", null),
      ],
    },
    done("Activity log cleared."),
  ];
}

/** Days until a product's expiry, or null when it has none. */
export function daysToExpiry(product: Product): number | null {
  if (!product.expiry) return null;
  return daysBetween(todayISO(), product.expiry);
}

/** Suggested shelf life when adding a perishable, by category. */
export function defaultShelfLife(category: Product["category"]): number | null {
  switch (category) {
    case "Dairy":
      return 7;
    case "Bakery":
      return 4;
    case "Fruits":
      return 5;
    case "Vegetables":
      return 6;
    case "Snacks":
      return 180;
    case "Beverages":
      return 180;
    case "Grocery":
      return 365;
    default:
      return null;
  }
}

/** Convenience: expiry date `days` from today, or null for a non-perishable. */
export function suggestedExpiry(category: Product["category"]): string | null {
  const days = defaultShelfLife(category);
  return days === null ? null : addDays(todayISO(), days);
}
