"use client";

/**
 * Restock.
 *
 * Receiving stock from a supplier. This is the only screen that increases
 * quantity, deliberately: stock goes up because a delivery arrived, and the
 * supplier bill is the record of what it cost and when.
 *
 * Recording a restock also refreshes each item's cost price and received date.
 * A shop buys at today's price, not at whatever it paid three months ago — and
 * leaving a stale cost in place silently understates the margin on everything
 * sold afterwards.
 */

import { useMemo, useState } from "react";
import Link from "next/link";

import { SiteFooter } from "@/components/Attribution";
import {
  Box,
  Check,
  Minus,
  Plus,
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
  StatTile,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney, formatMoneyCompact, inputToMoney } from "@/lib/money";
import { useStore } from "@/lib/store-context";
import type { Product, PurchaseLine } from "@/lib/types";

/** One row of the in-progress restock bill. */
interface DraftLine {
  productId: string;
  qty: number;
  unitCost: string;
}

export default function RestockPage() {
  const store = useStore();
  const { products, purchases, settings, hydrated } = store;

  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("");
  const [taxRate, setTaxRate] = useState(String(settings.defaultTaxRate));
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  /** Suppliers already in the ledger, offered as one-tap suggestions. */
  const knownSuppliers = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => {
      if (p.supplier) counts.set(p.supplier, (counts.get(p.supplier) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [products]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = [...products]
      .filter((p) => !p.archived)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!needle) return list.slice(0, 10);
    return list
      .filter((p) => `${p.name} ${p.sku} ${p.hsn}`.toLowerCase().includes(needle))
      .slice(0, 10);
  }, [products, query]);

  const lines = useMemo<PurchaseLine[]>(
    () =>
      draft
        .filter((line) => line.qty > 0)
        .map((line) => {
          const product = products.find((p) => p.id === line.productId);
          const unitCost = inputToMoney(line.unitCost);
          return {
            productId: line.productId,
            name: product?.name ?? "Unknown",
            qty: line.qty,
            unit: product?.unit ?? "pc",
            unitCost,
            amount: Math.round(unitCost * line.qty),
          };
        }),
    [draft, products],
  );

  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const tax = Math.round((subtotal * (Number.parseInt(taxRate, 10) || 0)) / 100);
  const grandTotal = subtotal + tax;

  /** Stock cost, for the "spend vs what it is worth" comparison. */
  const spend30 = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return purchases
      .filter((p) => new Date(p.at) >= cutoff)
      .reduce((sum, p) => sum + p.total, 0);
  }, [purchases]);

  function addProduct(product: Product) {
    setMessage(null);
    setDraft((prev) =>
      prev.some((line) => line.productId === product.id)
        ? prev
        : [
            ...prev,
            {
              productId: product.id,
              qty: 1,
              // Pre-filled with the current cost, which is usually right and
              // saves retyping — and is visibly editable when the supplier's
              // price has moved.
              unitCost: (product.costPrice / 100).toFixed(2),
            },
          ],
    );
  }

  function changeQty(productId: string, delta: number) {
    setDraft((prev) =>
      prev
        .map((line) =>
          line.productId === productId ? { ...line, qty: line.qty + delta } : line,
        )
        .filter((line) => line.qty > 0),
    );
  }

  function save() {
    const result = store.recordPurchase({
      supplier,
      lines,
      taxRate: Number.parseInt(taxRate, 10) || 0,
      note,
    });

    if (!result.ok) {
      setMessage({ text: result.message, ok: false });
      return;
    }

    setMessage({ text: result.message, ok: true });
    setDraft([]);
    setSupplier("");
    setNote("");
  }

  if (!hydrated) return <PageSkeleton stats={3} />;

  return (
    <>
      <PageHeader
        eyebrow="Purchasing"
        title="Record a restock"
        description="Add what arrived from your supplier. This adds the quantity, updates the cost price and refreshes the received date on every item."
      />

      {message && (
        <div className="mt-6">
          <Notice tone={message.ok ? "success" : "danger"}>{message.text}</Notice>
        </div>
      )}

      {products.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No products to restock"
            description="Add the items you sell first — a restock increases their quantity, so there has to be something to increase."
            icon={<Box size={30} />}
            action={
              <Link href="/stock" className="neu-btn neu-btn-primary">
                <Box size={18} /> Add products
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-7 grid gap-6 lg:grid-cols-5">
          {/* Picker. */}
          <div className="lg:col-span-3">
            <Field label="Supplier" hint="Who did you buy this from?">
              <input
                className="neu-input"
                value={supplier}
                onChange={(event) => setSupplier(event.target.value)}
                placeholder="Amul Distributor"
                list="suppliers"
              />
              {/* Datalist rather than a select: the owner types a new supplier
                  name as often as they pick an existing one. */}
              <datalist id="suppliers">
                {knownSuppliers.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>

            {knownSuppliers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {knownSuppliers.slice(0, 4).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSupplier(name)}
                    className="neu-btn neu-btn-sm !min-h-0 !px-3 !py-1.5 !text-[0.7rem]"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            <div className="relative mt-6">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search what you received…"
                aria-label="Search products"
                className="neu-input !pl-12"
              />
            </div>

            <ul className="mt-4 space-y-2.5">
              {matches.map((product) => {
                const onBill = draft.some((line) => line.productId === product.id);

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
                          {product.qty} in stock · last cost{" "}
                          {formatMoney(product.costPrice)}
                          {product.expiry &&
                            ` · expires ${formatDate(product.expiry)}`}
                        </p>
                      </div>

                      {onBill ? (
                        <span className="neu-capsule shrink-0">Added</span>
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
          </div>

          {/* The bill being recorded. */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-24">
              <SectionLabel>This delivery</SectionLabel>

              <Card className="mt-3 !p-0">
                {draft.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm font-medium text-ink-muted">
                    Nothing added yet. Search on the left and tap what arrived.
                  </p>
                ) : (
                  <ul>
                    {draft.map((line) => {
                      const product = products.find((p) => p.id === line.productId);
                      if (!product) return null;

                      return (
                        <li
                          key={line.productId}
                          className="border-b border-shadow-dark/15 px-4 py-3 last:border-b-0"
                        >
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-display text-base font-bold text-ink">
                                {product.name}
                              </p>
                              <p className="tabular mt-0.5 text-xs font-semibold text-ink-muted">
                                {line.qty} × {formatMoney(inputToMoney(line.unitCost))}
                              </p>
                            </div>
                            <IconButton
                              label={`Remove ${product.name}`}
                              tone="danger"
                              onClick={() =>
                                setDraft((prev) =>
                                  prev.filter((l) => l.productId !== line.productId),
                                )
                              }
                            >
                              <Trash size={15} />
                            </IconButton>
                          </div>

                          <div className="mt-2.5 flex items-center gap-2">
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => changeQty(line.productId, -1)}
                                aria-label={`Fewer ${product.name}`}
                                className="neu-btn neu-btn-sm !min-h-0 !p-1.5"
                              >
                                <Minus size={15} weight="bold" />
                              </button>
                              <span className="tabular w-10 text-center text-base font-bold text-ink">
                                {line.qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => changeQty(line.productId, 1)}
                                aria-label={`More ${product.name}`}
                                className="neu-btn neu-btn-sm !min-h-0 !p-1.5"
                              >
                                <Plus size={15} weight="bold" />
                              </button>
                            </div>

                            <label className="min-w-0 flex-1">
                              <span className="sr-only">
                                Cost per unit for {product.name}
                              </span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={line.unitCost}
                                onChange={(event) =>
                                  setDraft((prev) =>
                                    prev.map((l) =>
                                      l.productId === line.productId
                                        ? {
                                            ...l,
                                            unitCost: event.target.value.replace(
                                              /[^0-9.]/g,
                                              "",
                                            ),
                                          }
                                        : l,
                                    ),
                                  )
                                }
                                placeholder="Cost"
                                className="neu-input neu-input-money !min-h-0 !px-3 !py-2"
                              />
                            </label>

                            <span className="tabular w-20 shrink-0 text-right text-sm font-bold text-ink">
                              {formatMoney(
                                inputToMoney(line.unitCost) * line.qty,
                              )}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card className="mt-4 space-y-4">
                <Field
                  label="GST % on purchase"
                  hint="Input tax you paid, for your records."
                >
                  <select
                    className="neu-input"
                    value={taxRate}
                    onChange={(event) => setTaxRate(event.target.value)}
                  >
                    {[0, 5, 12, 18, 28].map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}%
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Note">
                  <input
                    className="neu-input"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Optional — bill number, damaged items…"
                  />
                </Field>

                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="font-semibold text-ink-muted">Subtotal</dt>
                    <dd className="tabular font-bold text-ink-muted">
                      {formatMoney(subtotal)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="font-semibold text-ink-muted">Input GST</dt>
                    <dd className="tabular font-bold text-ink-muted">
                      {formatMoney(tax)}
                    </dd>
                  </div>
                  <div className="neu-inset mt-3 flex items-baseline justify-between px-4 py-3">
                    <dt className="font-display text-base font-bold text-ink">
                      Total paid
                    </dt>
                    <dd className="tabular font-display text-2xl font-bold text-brand">
                      {formatMoney(grandTotal)}
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={save}
                  disabled={draft.length === 0 || !supplier.trim()}
                  className="neu-btn neu-btn-primary !min-h-14 w-full"
                >
                  <Check size={20} weight="bold" /> Save delivery
                </button>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Purchase ledger. */}
      <div className="mt-10">
        <SectionLabel>Purchase ledger</SectionLabel>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <StatTile
            label="Suppliers"
            value={String(new Set(purchases.map((p) => p.supplier)).size)}
            hint="you have bought from"
          />
          <StatTile
            label="Spent, 30 days"
            value={formatMoneyCompact(spend30)}
            hint="on restocking"
            tone="notice"
          />
          <StatTile
            label="Deliveries"
            value={String(purchases.length)}
            hint="recorded in total"
          />
        </div>

        <div className="mt-5">
          {purchases.length === 0 ? (
            <EmptyState
              title="No purchases recorded"
              description="Supplier bills you record here build a history of what you have paid, which is what tells you whether your margins are being squeezed."
              icon={<Truck size={30} />}
            />
          ) : (
            <Card className="!p-0">
              <ul>
                {[...purchases]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((purchase) => (
                    <li
                      key={purchase.id}
                      className="flex flex-wrap items-center gap-4 border-b border-shadow-dark/15 px-5 py-4 last:border-b-0"
                    >
                      <span className="neu-well grid size-10 shrink-0 place-items-center text-brand">
                        <Truck size={18} />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-base font-bold text-ink">
                          {purchase.supplier}
                        </p>
                        <p className="tabular mt-0.5 text-xs font-semibold text-ink-faint">
                          {purchase.billNo} · {formatDateTime(purchase.at)} ·{" "}
                          {purchase.lines.reduce((sum, l) => sum + l.qty, 0)} items
                        </p>
                      </div>

                      <p className="tabular shrink-0 font-display text-lg font-bold text-ink">
                        {formatMoney(purchase.total)}
                      </p>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <SiteFooter />
    </>
  );
}
