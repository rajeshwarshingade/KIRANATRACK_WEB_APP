/**
 * KiranaTrack domain types.
 *
 * Design notes that shape everything else:
 *
 *  1. **Stock lives on the product, not on a separate ledger.** A kirana counter
 *     needs the quantity in front of it in one tap. Movements (purchases, sales,
 *     write-offs) are retained separately in `ActivityEvent` for the audit trail
 *     and for the velocity maths, but the on-hand number is denormalised onto the
 *     product so the billing screen never has to replay history to answer
 *     "how many do I have?".
 *
 *  2. **Money is integer paise, never floats.** `0.1 + 0.2` problems in a GST
 *     invoice are not cosmetic — they produce a total that does not reconcile
 *     against the tax the shop actually owes. Every amount crossing a boundary
 *     (invoice total, purchase total, stock value) is a whole number of paise.
 *
 *  3. **Expiry is optional.** A large share of kirana stock (rice, oil, soap,
 *     cleaning agents) either has a very long shelf life or is entered without
 *     one. Modelling expiry as `string | null` rather than inventing a default
 *     keeps non-perishable goods from silently generating false "expiring soon"
 *     warnings, which would destroy trust in the alerts.
 *
 *  4. **Dates are ISO `YYYY-MM-DD` strings**, never `Date` objects. Timezone
 *     drift turns a batch expiring "tomorrow" into one that expired "today" for
 *     any user east or west of UTC, and the storage layer would have to serialise
 *     `Date` objects consistently. A date-only string has no timezone and cannot
 *     drift.
 */

/** Whole paise. 100 paise = ₹1. */
export type Paise = number;

export type PaymentMode = "cash" | "upi" | "card" | "credit";

export type Unit = "pc" | "kg" | "g" | "l" | "ml" | "pack" | "dozen";

export type Category =
  | "Grocery"
  | "Beverages"
  | "Snacks"
  | "Dairy"
  | "Bakery"
  | "Fruits"
  | "Vegetables"
  | "Household"
  | "Personal Care"
  | "Baby Care"
  | "Stationery"
  | "Other";

export const CATEGORIES: readonly Category[] = [
  "Grocery",
  "Beverages",
  "Snacks",
  "Dairy",
  "Bakery",
  "Fruits",
  "Vegetables",
  "Household",
  "Personal Care",
  "Baby Care",
  "Stationery",
  "Other",
] as const;

export const UNITS: readonly Unit[] = [
  "pc",
  "kg",
  "g",
  "l",
  "ml",
  "pack",
  "dozen",
] as const;

export const UNIT_LABEL: Record<Unit, string> = {
  pc: "Pcs",
  kg: "Kg",
  g: "Gram",
  l: "Litre",
  ml: "ML",
  pack: "Pack",
  dozen: "Dozen",
};

/**
 * Stock health, derived from `expiry` against today.
 *
 * `fresh` covers everything past the warning window. `none` is a distinct value
 * rather than `fresh` so the UI can say "no expiry" instead of implying a
 * tracked date that does not exist.
 */
export type StockHealth = "expired" | "critical" | "warning" | "fresh" | "none";

/** A single item on the shelf. */
export interface Product {
  id: string;
  name: string;
  /** Stock-keeping unit. Human-readable, e.g. `ABC-FOIL-80`. */
  sku: string;
  category: Category;
  unit: Unit;
  /** On-hand quantity, in `unit`. Denormalised — see note 1. */
  qty: number;
  /** What the shop pays the supplier, per `unit`. */
  costPrice: Paise;
  /** What the customer is charged, per `unit`. */
  sellPrice: Paise;
  /**
   * GST rate as a whole percent. Stored as an integer because 18% is 18, and
   * `0.18` invites float drift in the tax line.
   */
  taxRate: number;
  /** ISO `YYYY-MM-DD`, or null for non-perishables. See note 3. */
  expiry: string | null;
  /** ISO `YYYY-MM-DD` the stock arrived. */
  receivedOn: string;
  /** Low-stock threshold used by the reorder advisor. */
  reorderAt: number;
  supplier: string;
  /** HSN code for GST filing. */
  hsn: string;
  /** Free-text shelf/rack location. */
  location: string;
  createdAt: string;
  archived: boolean;
}

/** One row on a customer bill. */
export interface SaleLine {
  productId: string;
  /** Name and price are copied, not referenced. */
  name: string;
  hsn: string;
  qty: number;
  unit: Unit;
  /** Price charged per unit, after any per-line discount. */
  unitPrice: Paise;
  taxRate: number;
  /** Pre-tax amount for the line, in paise. */
  amount: Paise;
  /**
   * What this unit cost the shop at the moment it was sold.
   *
   * Copied rather than looked up at read time, because repricing an item must
   * not retroactively rewrite the profit on a bill that has already been
   * issued. Historic margin reports stay truthful across any later price change.
   */
  costAtSale: Paise;
}

/**
 * A customer bill.
 *
 * `sgst` and `cgst` are stored separately because that is how a GST invoice is
 * presented in India: an intra-state sale splits the tax evenly, and the two
 * halves must appear as distinct lines for filing.
 */
export interface Sale {
  id: string;
  /** Human-facing sequential invoice number, e.g. `INV-0042`. */
  invoiceNo: string;
  /** ISO timestamp of the sale. */
  at: string;
  lines: SaleLine[];
  /** Sum of line amounts before tax, in paise. */
  subtotal: Paise;
  /** Total discount applied across the bill, in paise. */
  discount: Paise;
  cgst: Paise;
  sgst: Paise;
  /** Rounding adjustment applied to reach a clean payable amount, in paise. */
  roundOff: Paise;
  /** Grand total payable, in paise. */
  total: Paise;
  mode: PaymentMode;
  customerName: string;
  customerPhone: string;
  /** Credit bills raise an udhaar (credit) balance for the customer. */
  note: string;
}

/** A row on a restock bill. */
export interface PurchaseLine {
  productId: string;
  name: string;
  qty: number;
  unit: Unit;
  unitCost: Paise;
  amount: Paise;
}

/** Stock received from a supplier. */
export interface Purchase {
  id: string;
  billNo: string;
  at: string;
  supplier: string;
  lines: PurchaseLine[];
  subtotal: Paise;
  taxRate: number;
  tax: Paise;
  total: Paise;
  note: string;
}

export type EventKind =
  | "sale"
  | "purchase"
  | "product_add"
  | "product_edit"
  | "product_delete"
  | "stock_adjust"
  | "settings";

/**
 * Audit trail.
 *
 * Expiry write-offs and manual corrections are recorded here rather than being
 * folded into sales or purchases, so "why did this quantity change?" always has
 * an answer a shop owner can read.
 */
export interface ActivityEvent {
  id: string;
  at: string;
  kind: EventKind;
  title: string;
  detail: string;
  /** Signed paise impact on stock value, or null for non-stock events. */
  valueImpact: Paise | null;
}

/** Store identity and tax registration. */
export interface StoreProfile {
  name: string;
  owner: string;
  phone: string;
  address: string;
  gstin: string;
  state: string;
  /** Place of supply code. Defaults to Maharashtra (27). */
  stateCode: string;
}

/**
 * Optional hosted-LLM configuration.
 *
 * Every field is nullable because the app is fully functional without any of
 * them — the advisor's own analysis engine produces the same insights offline.
 * The key never leaves the device except in the request the user explicitly
 * triggers.
 */
export interface AiConfig {
  provider: "openai" | "gemini" | "groq" | "anthropic" | null;
  apiKey: string;
  model: string;
  enabled: boolean;
}

export interface Settings {
  profile: StoreProfile;
  /** Days before expiry at which a product is flagged amber. */
  expiryWarnDays: number;
  /** Days before expiry at which a product is flagged red. */
  expiryCriticalDays: number;
  /** Default tax rate for new products, as a whole percent. */
  defaultTaxRate: number;
  /** Start of the trading day, "HH:MM", used by the day-book report. */
  dayStart: string;
  lowStockOn: boolean;
  /** Show the "load demo data" action in settings. */
  demoDataOn: boolean;
  ai: AiConfig;
}

export interface Database {
  products: Product[];
  sales: Sale[];
  purchases: Purchase[];
  events: ActivityEvent[];
  settings: Settings;
}

/** Keys of the independent slices of the database. */
export type Slice = "products" | "sales" | "purchases" | "events" | "settings";

/* ==========================================================================
   Derived shapes — analytics output. Never persisted.
   ========================================================================== */

/** Total profit on a sale line: charged price minus the product's cost. */
export interface ProfitBreakdown {
  revenue: Paise;
  cost: Paise;
  profit: Paise;
  /** Profit as a percent of revenue. Zero-revenue lines yield 0. */
  marginPct: number;
}

export interface CategoryStat {
  category: Category;
  revenue: Paise;
  profit: Paise;
  units: number;
  products: number;
}

export interface DayStat {
  /** `YYYY-MM-DD`. */
  date: string;
  revenue: Paise;
  profit: Paise;
  bills: number;
}

export interface ProductVelocity {
  productId: string;
  name: string;
  category: Category;
  /** Units sold per active day, averaged over the window. */
  perDay: number;
  /** Total units sold in the window. */
  units: number;
  revenue: Paise;
  profit: Paise;
  lastSoldAt: string | null;
}

export interface ExpiryBucket {
  productId: string;
  name: string;
  qty: number;
  value: Paise;
  expiry: string;
  daysLeft: number;
  health: StockHealth;
}

export type AdvisorSeverity = "critical" | "warning" | "info" | "positive";

export type AdvisorCategory =
  | "expiry"
  | "reorder"
  | "deadstock"
  | "pricing"
  | "margin"
  | "demand"
  | "cash";

/** Machine-readable action a suggestion can perform when applied. */
export type AdvisorAction =
  | { kind: "restock"; productId: string; qty: number }
  | { kind: "markdown"; productId: string; pct: number }
  | { kind: "adjustReorder"; productId: string; value: number }
  | { kind: "writeOff"; productId: string; qty: number };

export interface AdvisorInsight {
  id: string;
  severity: AdvisorSeverity;
  category: AdvisorCategory;
  title: string;
  /** Why this matters, in store-owner language rather than analyst language. */
  detail: string;
  /** Money at stake, in paise. Null when not quantifiable. */
  impact: Paise | null;
  /** Label for the primary button. */
  actionLabel: string | null;
  action: AdvisorAction | null;
  /** 0-100. How strongly the underlying data supports this. */
  confidence: number;
}
