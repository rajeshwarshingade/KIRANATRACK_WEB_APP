/**
 * Demo shop data.
 *
 * A first-run store with zero products is the worst possible first experience
 * for this app: every chart is empty, the advisor has nothing to say, and the
 * owner cannot tell whether the thing is broken or simply new. So the app seeds
 * a realistic small kirana, clearly labelled, that the owner can wipe in one
 * tap from Settings.
 *
 * Two things make the seeded data useful rather than decorative:
 *
 *  1. **It contains deliberate problems.** A packet about to expire, an item
 *     sold below cost, a genuinely dead line, a fast mover sitting at zero. Those
 *     are the cases the advisor exists to catch, so it has something true to
 *     report on first open rather than an empty panel.
 *
 *  2. **History spans ~90 days with weekday structure.** A flat random series
 *     would make every chart a straight line and teach the owner nothing about
 *    what the app can actually show. The generator below builds a weekly rhythm,
 *    a festival spike, and a slow upward trend.
 */

import { addDays, toISODate, todayISO } from "./dates";
import { buildSaleTotals } from "./money";
import { createId } from "./storage";
import type {
  ActivityEvent,
  Database,
  PaymentMode,
  Product,
  Purchase,
  Sale,
  SaleLine,
} from "./types";

/** Seeded catalogue. `weight` drives how often the line sells. */
type Seed = {
  name: string;
  sku: string;
  category: Product["category"];
  unit: Product["unit"];
  cost: number;
  sell: number;
  tax: number;
  qty: number;
  reorderAt: number;
  supplier: string;
  hsn: string;
  /** Days until expiry, or null for a non-perishable. */
  expiryIn: number | null;
  weight: number;
  location: string;
};

const SEEDS: Seed[] = [
  // Staples — the bread and butter, high turnover, thin margin.
  { name: "Sona Masoori Rice 5kg", sku: "RICE-SM-5", category: "Grocery", unit: "pc", cost: 42000, sell: 46500, tax: 5, qty: 24, reorderAt: 10, supplier: "Sharma Traders", hsn: "1006", expiryIn: 240, weight: 22, location: "Rack A1" },
  { name: "Toor Dal 1kg", sku: "DAL-TR-1", category: "Grocery", unit: "kg", cost: 13200, sell: 14800, tax: 5, qty: 18, reorderAt: 8, supplier: "Sharma Traders", hsn: "0713", expiryIn: 200, weight: 20, location: "Rack A2" },
  { name: "Sunflower Oil 1L", sku: "OIL-SF-1", category: "Grocery", unit: "l", cost: 11800, sell: 13200, tax: 5, qty: 30, reorderAt: 12, supplier: "Sharma Traders", hsn: "1512", expiryIn: 300, weight: 24, location: "Rack A3" },
  { name: "Wheat Flour 10kg", sku: "ATR-WH-10", category: "Grocery", unit: "pc", cost: 28500, sell: 32000, tax: 5, qty: 15, reorderAt: 6, supplier: "Sharma Traders", hsn: "1101", expiryIn: 180, weight: 16, location: "Rack A4" },
  { name: "Iodised Salt 1kg", sku: "SALT-IO-1", category: "Grocery", unit: "kg", cost: 1400, sell: 2000, tax: 5, qty: 40, reorderAt: 15, supplier: "Sharma Traders", hsn: "2501", expiryIn: 400, weight: 14, location: "Rack A5" },
  { name: "Sugar 1kg", sku: "SUG-1", category: "Grocery", unit: "kg", cost: 4100, sell: 4600, tax: 5, qty: 26, reorderAt: 10, supplier: "Sharma Traders", hsn: "1701", expiryIn: 320, weight: 18, location: "Rack A6" },

  // Beverages — fast, reliable, imported so no expiry tracking.
  { name: "Cola 750ml", sku: "BEV-COLA-750", category: "Beverages", unit: "pc", cost: 3200, sell: 4000, tax: 28, qty: 72, reorderAt: 24, supplier: "Metro Distributors", hsn: "2202", expiryIn: null, weight: 26, location: "Cooler 1" },
  { name: "Orange Juice 1L", sku: "BEV-OJ-1", category: "Beverages", unit: "l", cost: 8500, sell: 10500, tax: 12, qty: 16, reorderAt: 6, supplier: "Metro Distributors", hsn: "2009", expiryIn: 45, weight: 12, location: "Cooler 1" },
  { name: "Mineral Water 1L", sku: "BEV-MW-1", category: "Beverages", unit: "l", cost: 1100, sell: 2000, tax: 18, qty: 90, reorderAt: 30, supplier: "Metro Distributors", hsn: "2201", expiryIn: null, weight: 28, location: "Rack B1" },
  { name: "Tea Powder 250g", sku: "BEV-TEA-250", category: "Beverages", unit: "pc", cost: 12400, sell: 14800, tax: 5, qty: 14, reorderAt: 5, supplier: "Sharma Traders", hsn: "0902", expiryIn: 300, weight: 13, location: "Rack B2" },

  // Snacks — the margin category a kirana actually runs on.
  { name: "Namkeen Mix 200g", sku: "SNK-NMK-200", category: "Snacks", unit: "pc", cost: 4800, sell: 6000, tax: 12, qty: 22, reorderAt: 8, supplier: "Metro Distributors", hsn: "1904", expiryIn: 75, weight: 20, location: "Rack C1" },
  { name: "Biscuits Pack", sku: "SNK-BIS-P", category: "Snacks", unit: "pack", cost: 6500, sell: 8500, tax: 18, qty: 34, reorderAt: 12, supplier: "Metro Distributors", hsn: "1905", expiryIn: 120, weight: 24, location: "Rack C2" },
  { name: "Chocolates 100g", sku: "SNK-CHC-100", category: "Snacks", unit: "pc", cost: 8000, sell: 10000, tax: 18, qty: 19, reorderAt: 8, supplier: "Metro Distributors", hsn: "1806", expiryIn: 150, weight: 15, location: "Rack C3" },
  { name: "Instant Noodles", sku: "SNK-NDL-P", category: "Snacks", unit: "pack", cost: 1400, sell: 2000, tax: 12, qty: 8, reorderAt: 10, supplier: "Metro Distributors", hsn: "1902", expiryIn: null, weight: 19, location: "Rack C4" },

  // Dairy — the expiry engine. Short shelf life is the whole point.
  { name: "Amul Butter 500g", sku: "DRY-BTR-500", category: "Dairy", unit: "pc", cost: 24500, sell: 28000, tax: 12, qty: 11, reorderAt: 5, supplier: "Amul Distributor", hsn: "0405", expiryIn: 38, weight: 17, location: "Fridge 1" },
  { name: "Milk 1L", sku: "DRY-MLK-1", category: "Dairy", unit: "l", cost: 5400, sell: 6600, tax: 5, qty: 20, reorderAt: 10, supplier: "Amul Distributor", hsn: "0401", expiryIn: 2, weight: 27, location: "Fridge 1" },
  { name: "Curd 400g", sku: "DRY-CRD-400", category: "Dairy", unit: "pc", cost: 3200, sell: 4000, tax: 5, qty: 14, reorderAt: 6, supplier: "Amul Distributor", hsn: "0403", expiryIn: 4, weight: 21, location: "Fridge 1" },
  { name: "Paneer 200g", sku: "DRY-PNR-200", category: "Dairy", unit: "pc", cost: 7800, sell: 9000, tax: 5, qty: 9, reorderAt: 4, supplier: "Amul Distributor", hsn: "0406", expiryIn: 6, weight: 15, location: "Fridge 1" },

  // Household — bulk, slow, high value per unit.
  { name: "Dishwash Liquid 500ml", sku: "HSH-DSH-500", category: "Household", unit: "pc", cost: 7200, sell: 9500, tax: 18, qty: 17, reorderAt: 6, supplier: "Metro Distributors", hsn: "3402", expiryIn: null, weight: 11, location: "Rack D1" },
  { name: "Detergent Powder 2kg", sku: "HSH-DET-2", category: "Household", unit: "pc", cost: 23500, sell: 29000, tax: 18, qty: 12, reorderAt: 5, supplier: "Metro Distributors", hsn: "3402", expiryIn: null, weight: 13, location: "Rack D2" },
  { name: "Toilet Cleaner 500ml", sku: "HSH-TCL-500", category: "Household", unit: "pc", cost: 5500, sell: 7200, tax: 18, qty: 21, reorderAt: 8, supplier: "Metro Distributors", hsn: "3402", expiryIn: null, weight: 12, location: "Rack D3" },

  // Personal care.
  { name: "Colgate Toothpaste 200g", sku: "PCL-TPT-200", category: "Personal Care", unit: "pc", cost: 9800, sell: 12500, tax: 18, qty: 24, reorderAt: 8, supplier: "Metro Distributors", hsn: "3306", expiryIn: null, weight: 18, location: "Rack E1" },
  { name: "Shampoo 180ml", sku: "PCL-SHM-180", category: "Personal Care", unit: "pc", cost: 17500, sell: 22000, tax: 18, qty: 13, reorderAt: 5, supplier: "Metro Distributors", hsn: "3305", expiryIn: null, weight: 14, location: "Rack E2" },
  { name: "Bath Soap 100g", sku: "PCL-SAP-100", category: "Personal Care", unit: "pc", cost: 3400, sell: 4500, tax: 18, qty: 48, reorderAt: 18, supplier: "Metro Distributors", hsn: "3401", expiryIn: null, weight: 16, location: "Rack E3" },

  // Deliberate problems the advisor should catch.
  { name: "Curd 400g (Old Batch)", sku: "DRY-CRD-OLD", category: "Dairy", unit: "pc", cost: 3200, sell: 4000, tax: 5, qty: 6, reorderAt: 0, supplier: "Amul Distributor", hsn: "0403", expiryIn: -3, weight: 0, location: "Fridge 1" },
  { name: "Orange Juice 500ml", sku: "BEV-OJ-500", category: "Beverages", unit: "pc", cost: 4200, sell: 3600, tax: 12, qty: 12, reorderAt: 0, supplier: "Metro Distributors", hsn: "2009", expiryIn: null, weight: 0, location: "Cooler 1" },
  { name: "Gift Hamper Box", sku: "OTH-HMP-1", category: "Other", unit: "pc", cost: 45000, sell: 55000, tax: 18, qty: 3, reorderAt: 0, supplier: "Metro Distributors", hsn: "4901", expiryIn: null, weight: 0, location: "Back Store" },
];

/**
 * Deterministic pseudo-random generator.
 *
 * A seeded LCG rather than `Math.random`, so the demo shop looks identical on
 * every device. That matters when someone screenshots the dashboard to ask
 * "why does mine say 47 sales and yours says 63?" — it should be the same shop.
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // Numerical Recipes LCG constants.
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Weighted pick without replacement per day.
 *
 * Sampling by weight rather than uniformly is what makes the sales history
 * resemble a real shop: milk and bread appear on most days, gift hampers never.
 */
function weightedPick(items: Seed[], rand: () => number): Seed {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return items[0];

  let roll = rand() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

/** Day-of-week multiplier: weekends are busier in a neighbourhood shop. */
const WEEKDAY_FACTOR = [1.25, 0.85, 0.88, 0.92, 0.98, 1.2, 1.45];

export function buildDemoDatabase(): Database {
  const rand = makeRandom(20260312);
  const today = todayISO();

  const products: Product[] = SEEDS.map((seed) => ({
    id: createId(),
    name: seed.name,
    sku: seed.sku,
    category: seed.category,
    unit: seed.unit,
    qty: seed.qty,
    costPrice: seed.cost,
    sellPrice: seed.sell,
    taxRate: seed.tax,
    expiry: seed.expiryIn === null ? null : addDays(today, seed.expiryIn),
    receivedOn: addDays(today, -Math.floor(rand() * 40) - 3),
    reorderAt: seed.reorderAt,
    supplier: seed.supplier,
    hsn: seed.hsn,
    location: seed.location,
    createdAt: new Date().toISOString(),
    archived: false,
  }));

  // Only lines that are meant to actually sell take part in the history.
  const sellableSeeds = SEEDS.filter((s) => s.weight > 0);
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  const sales: Sale[] = [];
  const HISTORY_DAYS = 90;

  for (let back = HISTORY_DAYS - 1; back >= 0; back -= 1) {
    const date = addDays(today, -back);
    const parsed = new Date(`${date}T12:00:00`);
    const weekday = parsed.getDay();

    // Slow upward trend over the quarter plus a festival-week spike, so the
    // monthly chart has a shape worth reading.
    const trend = 1 + ((HISTORY_DAYS - back) / HISTORY_DAYS) * 0.35;
    const festival = back < 9 && back > 2 ? 1.6 : 1;

    const billCount = Math.max(
      3,
      Math.round((6 + rand() * 8) * WEEKDAY_FACTOR[weekday] * trend * festival),
    );

    for (let b = 0; b < billCount; b += 1) {
      const lineCount = 1 + Math.floor(rand() * 4);
      const chosen = new Set<string>();
      const lines: SaleLine[] = [];

      for (let l = 0; l < lineCount; l += 1) {
        // Weighted, not uniform: milk and biscuits appear on most bills while
        // tea and oil appear less often, which is what real till data looks
        // like. Uniform sampling would make every line equally common and the
        // velocity analytics would have nothing real to find.
        const seed = weightedPick(sellableSeeds, rand);
        const product = productBySku.get(seed.sku);
        if (!product || chosen.has(product.id)) continue;
        chosen.add(product.id);

        const qty = 1 + Math.floor(rand() * 3);
        const unitPrice = seed.sell;

        lines.push({
          productId: product.id,
          name: product.name,
          hsn: product.hsn,
          qty,
          unit: product.unit,
          unitPrice,
          taxRate: product.taxRate,
          amount: Math.round(unitPrice * qty),
          costAtSale: product.costPrice,
        });
      }

      if (lines.length === 0) continue;

      const discountPct = rand() > 0.88 ? 5 : 0;
      const totals = buildSaleTotals(lines, discountPct, false);

      // UPI and cash dominate; a little credit is realistic for a neighbourhood.
      const roll = rand();
      const mode: PaymentMode = roll > 0.88 ? "credit" : roll > 0.55 ? "upi" : "cash";

      const hour = 9 + Math.floor(rand() * 12);
      const minute = Math.floor(rand() * 60);

      sales.push({
        id: createId(),
        invoiceNo: "",
        at: new Date(
          `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
        ).toISOString(),
        lines,
        subtotal: totals.subtotal,
        discount: totals.discount,
        cgst: totals.cgst,
        sgst: totals.sgst,
        roundOff: totals.roundOff,
        total: totals.total,
        mode,
        customerName: mode === "credit" ? CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)] : "",
        customerPhone: mode === "credit" ? `9${Math.floor(100000000 + rand() * 899999999)}` : "",
        note: "",
      });
    }
  }

  // Invoice numbers assigned after ordering, so they run sequentially.
  sales.sort((a, b) => a.at.localeCompare(b.at));
  sales.forEach((sale, index) => {
    sale.invoiceNo = `INV-${String(index + 1).padStart(4, "0")}`;
  });

  // A few restock bills, so the purchase ledger is not empty on first open.
  const purchases: Purchase[] = [];
  const suppliers = ["Sharma Traders", "Metro Distributors", "Amul Distributor"];

  suppliers.forEach((supplier, index) => {
    const theirLines = sellableSeeds
      .filter((s) => s.supplier === supplier)
      .slice(0, 5)
      .map((seed) => {
        const product = productBySku.get(seed.sku) as Product;
        return {
          productId: product.id,
          name: product.name,
          qty: 10 + Math.floor(rand() * 15),
          unit: product.unit,
          unitCost: seed.cost,
          amount: 0,
        };
      });
    const lines = theirLines;
    lines.forEach((line) => {
      line.amount = Math.round(line.unitCost * line.qty);
    });

    const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
    const tax = Math.round((subtotal * 5) / 100);

    purchases.push({
      id: createId(),
      billNo: `PO-${String(index + 1).padStart(3, "0")}`,
      at: new Date(addDays(today, -45 + index * 12)).toISOString(),
      supplier,
      lines,
      subtotal,
      taxRate: 5,
      tax,
      total: subtotal + tax,
      note: "",
    });
  });

  const events: ActivityEvent[] = [
    {
      id: createId(),
      at: new Date().toISOString(),
      kind: "settings",
      title: "Demo shop loaded",
      detail: "Sample products, sales and restocks so you can explore the app",
      valueImpact: null,
    },
  ];

  return {
    products,
    sales,
    purchases,
    events,
    settings: {
      profile: {
        name: "Sharma General Store",
        owner: "Rajeshwar Shingade",
        phone: "98765 43210",
        address: "Shop 14, Main Market Road, Indore, Madhya Pradesh 452001",
        gstin: "23AABCS1429B1ZX",
        state: "Madhya Pradesh",
        stateCode: "23",
      },
      expiryWarnDays: 14,
      expiryCriticalDays: 3,
      defaultTaxRate: 5,
      dayStart: "08:00",
      lowStockOn: true,
      demoDataOn: false,
      ai: { provider: null, apiKey: "", model: "", enabled: false },
    },
  };
}

const CUSTOMERS = [
  "Ramesh Yadav",
  "Sunita Patil",
  "Imran Shaikh",
  "Priya Deshmukh",
  "Vikram Joshi",
];

/** The shop's opening date, used by the About screen. */
export function demoSince(): string {
  return addDays(toISODate(new Date()), -90);
}
