/**
 * Backup, restore and spreadsheet export.
 *
 * Local-first storage has one real weakness: the data lives on one device, and a
 * phone that is lost, factory-reset or uninstalled takes the entire ledger with
 * it. There is no server to restore from. So the backup path is not a nice-to-have
 * here — it is the only thing standing between a shop and a year of records.
 *
 * Two formats, for two different needs:
 *
 *  - **JSON** is the real backup. It is lossless, versioned and restorable, and
 *    it is what the owner should take home once a week.
 *  - **CSV** is for the accountant. It is a view of the same data in a shape
 *    Excel, Tally and a GST return can actually read. It cannot be restored.
 */

import { formatDate, toISODate } from "./dates";
import { formatMoney } from "./money";
import type { Database, Product, Sale } from "./types";

/** Bumped when the backup shape changes incompatibly. */
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: "kiranatrack";
  version: number;
  /** When the backup was taken. */
  at: string;
  data: Database;
}

/**
 * Build a backup document.
 *
 * The API key is stripped. A backup file is something an owner emails to
 * themselves or hands to an accountant, and a credential has no business
 * travelling in it — the AI layer is a convenience, trivially re-entered.
 */
export function buildBackup(db: Database): BackupFile {
  return {
    app: "kiranatrack",
    version: BACKUP_VERSION,
    at: new Date().toISOString(),
    data: {
      ...db,
      settings: {
        ...db.settings,
        ai: { ...db.settings.ai, apiKey: "" },
      },
    },
  };
}

/** Serialise a backup for download. */
export function serialiseBackup(db: Database): string {
  return JSON.stringify(buildBackup(db), null, 2);
}

export type RestoreResult =
  | { ok: true; data: Database; summary: string }
  | { ok: false; error: string };

/**
 * Parse a backup file.
 *
 * Validated rather than trusted. A restore replaces the entire live database,
 * so a malformed or wrong-app file must be rejected loudly instead of leaving
 * the owner with an empty shop and no explanation.
 */
export function parseBackup(text: string): RestoreResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not readable as a backup." };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "That file is not a KiranaTrack backup." };
  }

  const file = parsed as Partial<BackupFile>;

  if (file.app !== "kiranatrack") {
    return { ok: false, error: "That backup came from a different app." };
  }

  const data = file.data as Partial<Database> | undefined;
  if (!data || !Array.isArray(data.products) || !Array.isArray(data.sales)) {
    return {
      ok: false,
      error: "That backup is missing its product or sales records, so it cannot be restored.",
    };
  }

  // A backup newer than this build would carry fields this version drops on
  // save. Restoring it would silently discard data, so it is refused instead.
  if (typeof file.version === "number" && file.version > BACKUP_VERSION) {
    return {
      ok: false,
      error:
        "That backup was made by a newer version of KiranaTrack. Update the app first, or restore the file on a device running the newer build.",
    };
  }

  const restored: Database = {
    products: data.products ?? [],
    sales: data.sales ?? [],
    purchases: data.purchases ?? [],
    events: data.events ?? [],
    settings: data.settings as Database["settings"],
  };

  return {
    ok: true,
    data: restored,
    summary: `${restored.products.length} products, ${restored.sales.length} bills, ${restored.purchases.length} restocks.`,
  };
}

/** Trigger a browser download of a text file. */
export function downloadText(filename: string, text: string, mime = "application/json") {
  // Only meaningful in a browser; the Android build has no filesystem picker.
  if (typeof document === "undefined") return;

  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Revoking immediately can cancel the download in some browsers; one tick is
  // enough for the navigation to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `kiranatrack-backup-2026-03-14.json` */
export function backupFilename(): string {
  return `kiranatrack-backup-${toISODate(new Date())}.json`;
}

/* ==========================================================================
   CSV — for the accountant
   ========================================================================== */

function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell);
          // Quote when the cell contains a comma, quote or newline, and double
          // any embedded quote — the RFC 4180 rule Excel expects.
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\n");
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  downloadText(filename, toCsv(rows), "text/csv");
}

/** Every bill as one row per line item, for GST reconciliation. */
export function exportSalesCsv(db: Database) {
  const productById = new Map(db.products.map((p) => [p.id, p]));

  const rows: (string | number)[][] = [
    [
      "Invoice No",
      "Date",
      "Customer",
      "Phone",
      "Payment",
      "SKU",
      "Product",
      "HSN",
      "Qty",
      "Unit",
      "Rate",
      "Tax %",
      "Taxable",
      "CGST",
      "SGST",
      "Line Total",
      "Cost",
      "Profit",
    ],
  ];

  for (const sale of db.sales) {
    for (const line of sale.lines) {
      const product = productById.get(line.productId);
      const taxable = line.amount - Math.round((line.amount * 0) / 100);

      rows.push([
        sale.invoiceNo,
        sale.at.slice(0, 10),
        sale.customerName,
        sale.customerPhone,
        sale.mode,
        product?.sku ?? "",
        line.name,
        line.hsn,
        line.qty,
        line.unit,
        (line.unitPrice / 100).toFixed(2),
        line.taxRate,
        (taxable / 100).toFixed(2),
        // Bill-level tax is apportioned across lines by taxable value, so the
        // per-line tax columns sum back to the bill's CGST and SGST exactly.
        (round2(apportion(sale.cgst, taxable, sale.subtotal)) / 100).toFixed(2),
        (round2(apportion(sale.sgst, taxable, sale.subtotal)) / 100).toFixed(2),
        (taxable / 100).toFixed(2),
        (product?.costPrice ?? line.costAtSale) / 100 === 0
          ? "0.00"
          : ((product?.costPrice ?? line.costAtSale) / 100).toFixed(2),
        (((line.unitPrice - (product?.costPrice ?? line.costAtSale)) * line.qty) / 100).toFixed(2),
      ]);
    }
  }

  downloadCsv(`kiranatrack-sales-${toISODate(new Date())}.csv`, rows);
}

/** Share a bill's taxable value of a bill-level total. */
function apportion(total: number, taxable: number, subtotal: number): number {
  return subtotal === 0 ? 0 : (total * taxable) / subtotal;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Stock position: what is on the shelf and what it is worth. */
export function exportStockCsv(products: Product[]) {
  const rows: (string | number)[][] = [
    [
      "SKU",
      "Product",
      "Category",
      "HSN",
      "Unit",
      "In Stock",
      "Cost",
      "Sell",
      "Margin %",
      "Stock Value",
      "Expiry",
      "Received On",
      "Supplier",
      "Location",
      "Reorder At",
    ],
  ];

  for (const p of products) {
    const margin = p.sellPrice === 0 ? 0 : ((p.sellPrice - p.costPrice) / p.sellPrice) * 100;
    rows.push([
      p.sku,
      p.name,
      p.category,
      p.hsn,
      p.unit,
      p.qty,
      (p.costPrice / 100).toFixed(2),
      (p.sellPrice / 100).toFixed(2),
      margin.toFixed(1),
      ((p.costPrice * p.qty) / 100).toFixed(2),
      p.expiry ?? "",
      p.receivedOn,
      p.supplier,
      p.location,
      p.reorderAt,
    ]);
  }

  downloadCsv(`kiranatrack-stock-${toISODate(new Date())}.csv`, rows);
}

/** One row per bill, for a day book. */
export function exportDayBookCsv(sales: Sale[]) {
  const rows: (string | number)[][] = [
    ["Invoice No", "Date", "Bills", "Customer", "Payment", "Subtotal", "Discount", "CGST", "SGST", "Round Off", "Total"],
  ];

  for (const sale of sales) {
    rows.push([
      sale.invoiceNo,
      sale.at.slice(0, 10),
      1,
      sale.customerName,
      sale.mode,
      (sale.subtotal / 100).toFixed(2),
      (sale.discount / 100).toFixed(2),
      (sale.cgst / 100).toFixed(2),
      (sale.sgst / 100).toFixed(2),
      (sale.roundOff / 100).toFixed(2),
      (sale.total / 100).toFixed(2),
    ]);
  }

  downloadCsv(`kiranatrack-daybook-${toISODate(new Date())}.csv`, rows);
}

/** A single bill as a printable thermal-style receipt. */
export function printReceipt(sale: Sale, storeName: string, gstin: string) {
  if (typeof window === "undefined") return;

  const taxTotal = sale.cgst + sale.sgst;
  const isInterState = sale.cgst === 0 && sale.sgst > 0;

  const rows = sale.lines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.name)}<br><small>${line.qty} × ${formatMoney(line.unitPrice)}</small></td>` +
        `<td class="r">${formatMoney(Math.round(line.unitPrice * line.qty))}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(sale.invoiceNo)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; width: 72mm; margin: 0 auto; padding: 8px; color: #000; }
  h1 { font-size: 14px; text-align: center; margin: 0 0 2px; }
  .sub { text-align: center; font-size: 10px; margin: 0 0 8px; }
  .hr { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  .tot { font-weight: bold; font-size: 13px; }
  .muted { font-size: 10px; }
  .foot { text-align: center; font-size: 10px; margin-top: 10px; }
</style></head><body>
  <h1>${escapeHtml(storeName)}</h1>
  <p class="sub">${gstin ? `GSTIN: ${escapeHtml(gstin)}<br>` : ""}${escapeHtml(sale.invoiceNo)} · ${formatDate(sale.at.slice(0, 10))}</p>
  <div class="hr"></div>
  <table>${rows}</table>
  <div class="hr"></div>
  <table>
    <tr><td>Subtotal</td><td class="r">${formatMoney(sale.subtotal)}</td></tr>
    ${sale.discount > 0 ? `<tr><td>Discount</td><td class="r">-${formatMoney(sale.discount)}</td></tr>` : ""}
    <tr><td>${isInterState ? "IGST" : "CGST"}</td><td class="r">${formatMoney(isInterState ? sale.sgst : sale.cgst)}</td></tr>
    ${isInterState ? "" : `<tr><td>SGST</td><td class="r">${formatMoney(sale.sgst)}</td></tr>`}
    ${sale.roundOff !== 0 ? `<tr><td>Round off</td><td class="r">${formatMoney(sale.roundOff)}</td></tr>` : ""}
    <tr class="tot"><td>Total</td><td class="r">${formatMoney(sale.total)}</td></tr>
  </table>
  <div class="hr"></div>
  <p class="muted">Paid by ${escapeHtml(sale.mode.toUpperCase())} · Tax ${formatMoney(taxTotal)}</p>
  ${sale.customerName ? `<p class="muted">${escapeHtml(sale.customerName)}${sale.customerPhone ? " · " + escapeHtml(sale.customerPhone) : ""}</p>` : ""}
  <p class="foot">Developed by SmallTown Studio<br>All rights belong to Rajeshwar Shingade</p>
  <script>window.onload=function(){window.print();}</script>
</body></html>`;

  const win = window.open("", "_blank", "width=340,height=600");
  if (!win) return;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

/**
 * Escape text going into the receipt's HTML.
 *
 * A customer name typed at the counter lands directly in this template, so an
 * unescaped `<` would break the receipt. This is the one place the app builds
 * raw HTML, which is exactly why it needs the guard.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
