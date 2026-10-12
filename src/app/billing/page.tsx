"use client";

/**
 * Billing.
 *
 * The screen a shop owner uses several dozen times a day, so every decision here
 * is about speed at a counter:
 *
 *  - **Search is the primary control.** Typing four letters of a product name is
 *    faster and more reliable than scrolling a grid, and it is what a counter
 *    actually does with one hand while the other holds a bag.
 *  - **Quantities step with the quantity column, not a separate dialog.** Every
 *    extra tap is a tap at a customer waiting.
 *  - **The total is always visible** and recomputes on every change, including
 *    tax and rounding, because the number shown is the number charged.
 *
 * GST is computed per rate across the whole bill (not per line), which is what
 * the tax authority expects on a mixed-rate bill, and the bill records whether
 * the customer was in-state so the split is CGST+SGST or IGST.
 */

import { useMemo, useState } from "react";
import Link from "next/link";

import { SiteFooter } from "@/components/Attribution";
import {
  Cart,
  Check,
  Minus,
  Plus,
  Print,
  Search,
  Trash,
  Truck,
} from "@/components/Icons";
import {
  Card,
  EmptyState,
  Field,
  IconButton,
  Notice,
  PageHeader,
  PageSkeleton,
  SectionLabel,
} from "@/components/ui";
import { activeProducts } from "@/lib/analytics";
import { printReceipt } from "@/lib/backup";
import { buildSaleTotals, formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store-context";
import {
  UNIT_LABEL,
  type PaymentMode,
  type Product,
  type SaleLine,
} from "@/lib/types";

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "credit", label: "Credit" },
];

export default function BillingPage() {
  const store = useStore();
  const { products, settings, hydrated } = store;

  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [discountPct, setDiscountPct] = useState("0");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [customerStateCode, setCustomerStateCode] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [lastInvoice, setLastInvoice] = useState<string | null>(null);

  const live = useMemo(
    () =>
      activeProducts(products)
        .filter((p) => p.qty > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return live.slice(0, 12);
    return live
      .filter((p) =>
        `${p.name} ${p.sku} ${p.hsn} ${p.category}`.toLowerCase().includes(needle),
      )
      .slice(0, 12);
  }, [query, live]);

  /*
   * Live totals.
   *
   * Recomputed from the lines on every render rather than stored, so the total
   * cannot drift from what the cart actually contains — a stale total on a
   * customer bill is the worst bug this screen could have.
   */
  const totals = useMemo(
    () =>
      buildSaleTotals(
        lines,
        Number.parseFloat(discountPct) || 0,
        customerStateCode.trim() !== "" &&
          customerStateCode.trim() !== settings.profile.stateCode,
      ),
    [lines, discountPct, customerStateCode, settings.profile.stateCode],
  );

  const inStock = live.reduce((sum, p) => sum + p.qty, 0);

  function addProduct(product: Product) {
    setMessage(null);

    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);

      // Tapping an item already on the bill increments it rather than adding a
      // second line — two lines for the same product would double-count the
      // tax and make the bill confusing to read.
      if (existing) {
        if (existing.qty + 1 > product.qty) {
          setMessage({
            text: `Only ${product.qty} ${UNIT_LABEL[product.unit].toLowerCase()} of ${product.name} left.`,
            ok: false,
          });
          return prev;
        }
        return prev.map((l) =>
          l.productId === product.id
            ? { ...l, qty: l.qty + 1, amount: Math.round(l.unitPrice * (l.qty + 1)) }
            : l,
        );
      }

      const line: SaleLine = {
        productId: product.id,
        name: product.name,
        hsn: product.hsn,
        qty: 1,
        unit: product.unit,
        unitPrice: product.sellPrice,
        taxRate: product.taxRate,
        amount: product.sellPrice,
        costAtSale: product.costPrice,
      };
      return [...prev, line];
    });
  }

  function changeQty(productId: string, delta: number) {
    setLines((prev) =>
      prev
        .map((line) => {
          if (line.productId !== productId) return line;
          const qty = line.qty + delta;
          if (qty <= 0) return null;
          return { ...line, qty, amount: Math.round(line.unitPrice * qty) };
        })
        .filter((line): line is SaleLine => line !== null),
    );
  }

  function setQty(productId: string, qty: number) {
    const product = products.find((p) => p.id === productId);
    const clamped = Math.max(0, Math.min(qty, product?.qty ?? qty));

    setLines((prev) =>
      prev
        .map((line) =>
          line.productId === productId
            ? { ...line, qty: clamped, amount: Math.round(line.unitPrice * clamped) }
            : line,
        )
        .filter((line) => line.qty > 0),
    );
  }

  function completeSale() {
    const result = store.recordSale({
      lines,
      discountPct: Number.parseFloat(discountPct) || 0,
      mode,
      customerName,
      customerPhone,
      note,
      interState: customerStateCode.trim() !== "" &&
        customerStateCode.trim() !== settings.profile.stateCode,
    });

    if (!result.ok) {
      setMessage({ text: result.message, ok: false });
      return;
    }

    setMessage({ text: result.message, ok: true });
    setLastInvoice(result.message.replace(" saved.", ""));
    setLines([]);
    setDiscountPct("0");
    setCustomerName("");
    setCustomerPhone("");
    setNote("");
  }

  const lastSale = useMemo(
    () => store.sales.find((s) => s.invoiceNo === lastInvoice) ?? null,
    [store.sales, lastInvoice],
  );

  if (!hydrated) return <PageSkeleton stats={3} />;

  if (live.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Billing" title="New bill" />
        <div className="mt-8">
          <EmptyState
            title="No stock to sell"
            description="You cannot bill an item that is not in your catalogue. Add products or record a restock first."
            icon={<Cart size={30} />}
            action={
              <Link href="/restock" className="neu-btn neu-btn-primary">
                <Truck size={18} /> Record a restock
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
        title="New bill"
        description="Search or tap items, set the quantity, and save. Tax and rounding are worked out for you."
      />

      {message && (
        <div className="mt-6">
          <Notice tone={message.ok ? "success" : "danger"}>
            {message.text}
            {message.ok && lastSale && (
              <span className="mt-2 block">
                <button
                  type="button"
                  onClick={() =>
                    printReceipt(lastSale, settings.profile.name, settings.profile.gstin)
                  }
                  className="neu-btn neu-btn-sm !min-h-0 !px-3 !py-1.5"
                >
                  <Print size={14} /> Print receipt
                </button>
              </span>
            )}
          </Notice>
        </div>
      )}

      <div className="mt-7 grid gap-6 lg:grid-cols-5">
        {/* Product picker. */}
        <div className="lg:col-span-3">
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a product by name or code…"
              aria-label="Search products to add to the bill"
              className="neu-input !pl-12 !text-lg"
              autoFocus
            />
          </div>

          <p className="mt-3 text-xs font-bold uppercase tracking-widest text-ink-muted">
            {query ? `${matches.length} match${matches.length === 1 ? "" : "es"}` : "Quick add"}
          </p>

          <ul className="mt-3 space-y-2.5">
            {matches.map((product) => {
              const onBill = lines.find((l) => l.productId === product.id);

              return (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => addProduct(product)}
                    className="neu-raised flex w-full items-center gap-4 px-4 py-3 text-left transition-shadow hover:shadow-raised"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-bold text-ink">
                        {product.name}
                      </p>
                      <p className="tabular mt-0.5 text-xs font-semibold text-ink-muted">
                        {formatMoney(product.sellPrice)} · {product.qty}{" "}
                        {UNIT_LABEL[product.unit].toLowerCase()} in stock
                        {product.taxRate > 0 && ` · GST ${product.taxRate}%`}
                      </p>
                    </div>

                    {onBill ? (
                      <span className="neu-inset-sm tabular shrink-0 px-3 py-1.5 text-sm font-bold text-brand">
                        ×{onBill.qty}
                      </span>
                    ) : (
                      <span className="neu-well grid size-10 shrink-0 place-items-center text-brand">
                        <Plus size={19} weight="bold" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {matches.length === 0 && (
            <p className="neu-inset mt-3 px-4 py-6 text-center text-sm font-medium text-ink-muted">
              Nothing matches &ldquo;{query}&rdquo;. Try part of the name or the SKU.
            </p>
          )}

          <p className="mt-4 text-xs font-medium text-ink-faint">
            {live.length} products in stock · {inStock} units on hand
          </p>
        </div>

        {/* Cart. */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-24">
            <SectionLabel>The bill</SectionLabel>

            <Card className="mt-3 !p-0">
              {lines.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm font-medium text-ink-muted">
                  Nothing added yet. Search above or tap a product to start the
                  bill.
                </p>
              ) : (
                <ul>
                  {lines.map((line) => {
                    const product = products.find((p) => p.id === line.productId);
                    const max = product?.qty ?? line.qty;

                    return (
                      <li
                        key={line.productId}
                        className="flex items-center gap-3 border-b border-shadow-dark/15 px-4 py-3 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-base font-bold text-ink">
                            {line.name}
                          </p>
                          <p className="tabular mt-0.5 text-xs font-semibold text-ink-muted">
                            {formatMoney(line.unitPrice)} × {line.qty}{" "}
                            {UNIT_LABEL[line.unit].toLowerCase()}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => changeQty(line.productId, -1)}
                            aria-label={`Reduce ${line.name}`}
                            className="neu-btn neu-btn-sm !min-h-0 !p-1.5"
                          >
                            <Minus size={15} weight="bold" />
                          </button>

                          <input
                            type="number"
                            min="0"
                            max={max}
                            step="any"
                            value={line.qty}
                            onChange={(e) =>
                              setQty(line.productId, Number.parseFloat(e.target.value) || 0)
                            }
                            aria-label={`Quantity of ${line.name}`}
                            className="neu-input neu-input-money !min-h-0 !w-16 !px-1 !py-1.5 !text-center"
                          />

                          <button
                            type="button"
                            onClick={() => changeQty(line.productId, 1)}
                            disabled={line.qty >= max}
                            aria-label={`Add one more ${line.name}`}
                            className="neu-btn neu-btn-sm !min-h-0 !p-1.5"
                          >
                            <Plus size={15} weight="bold" />
                          </button>

                          <span className="tabular w-20 shrink-0 text-right text-sm font-bold text-ink">
                            {formatMoney(line.amount)}
                          </span>

                          <IconButton
                            label={`Remove ${line.name}`}
                            tone="danger"
                            onClick={() =>
                              setLines((prev) =>
                                prev.filter((l) => l.productId !== line.productId),
                              )
                            }
                          >
                            <Trash size={15} />
                          </IconButton>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* Customer and payment. */}
            <Card className="mt-4 space-y-4">
              <Field label="Customer (optional)">
                <input
                  className="neu-input"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Cash sale"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <input
                    className="neu-input neu-input-money"
                    type="tel"
                    inputMode="numeric"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="98765 43210"
                  />
                </Field>

                <Field
                  label="State code"
                  hint={
                    customerStateCode.trim() === ""
                      ? "Blank = in-state"
                      : customerStateCode.trim() === settings.profile.stateCode
                        ? "In-state"
                        : "Inter-state"
                  }
                >
                  <input
                    className="neu-input neu-input-money"
                    inputMode="numeric"
                    maxLength={2}
                    value={customerStateCode}
                    onChange={(e) =>
                      setCustomerStateCode(e.target.value.replace(/\D/g, "").slice(0, 2))
                    }
                    placeholder={settings.profile.stateCode}
                  />
                </Field>
              </div>

              <div>
                <span className="neu-label">Paid by</span>
                <div className="grid grid-cols-4 gap-2">
                  {PAYMENT_MODES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={mode === option.value}
                      onClick={() => setMode(option.value)}
                      className={`neu-btn neu-btn-sm !min-h-0 !px-1 !py-2.5 !text-[0.7rem] ${
                        mode === option.value
                          ? "neu-tab-active"
                          : "neu-tab-idle"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="Discount %">
                <input
                  className="neu-input neu-input-money"
                  type="text"
                  inputMode="decimal"
                  value={discountPct}
                  onChange={(e) =>
                    setDiscountPct(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  placeholder="0"
                />
              </Field>

              <Field label="Note">
                <input
                  className="neu-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
            </Card>

            {/* Totals — always visible, always the number charged. */}
            <Card className="mt-4">
              <dl className="space-y-2.5 text-sm">
                <Row label="Subtotal" value={formatMoney(totals.subtotal)} />

                {totals.discount > 0 && (
                  <Row
                    label={`Discount ${Number.parseFloat(discountPct) || 0}%`}
                    value={`− ${formatMoney(totals.discount)}`}
                    tone="text-notice"
                  />
                )}

                {totals.interState ? (
                  <Row label="IGST" value={formatMoney(totals.igst)} />
                ) : (
                  <>
                    <Row label="CGST" value={formatMoney(totals.cgst)} />
                    <Row label="SGST" value={formatMoney(totals.sgst)} />
                  </>
                )}

                {totals.roundOff !== 0 && (
                  <Row
                    label="Round off"
                    value={formatMoney(totals.roundOff)}
                    tone="text-ink-faint"
                  />
                )}

                <div className="neu-inset mt-3 flex items-baseline justify-between px-4 py-3">
                  <dt className="font-display text-base font-bold text-ink">
                    Total
                  </dt>
                  <dd className="tabular font-display text-2xl font-bold text-brand">
                    {formatMoney(totals.total)}
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={completeSale}
                disabled={lines.length === 0}
                className="neu-btn neu-btn-primary neu-btn-success mt-4 !min-h-14 w-full"
              >
                <Check size={20} weight="bold" /> Save bill
              </button>

              {mode === "credit" && (
                <p className="mt-3 text-xs font-medium leading-relaxed text-notice">
                  This bill is marked credit (udhaar). Add the customer&apos;s name
                  above so you know who it belongs to.
                </p>
              )}
            </Card>
          </div>
        </div>
      </div>

      <SiteFooter />
    </>
  );
}

function Row({
  label,
  value,
  tone = "text-ink-muted",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={`font-semibold ${tone}`}>{label}</dt>
      <dd className={`tabular font-bold ${tone}`}>{value}</dd>
    </div>
  );
}
