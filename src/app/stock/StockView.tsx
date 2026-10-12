"use client";

/**
 * Stock screen.
 *
 * Split from `page.tsx` because it reads `useSearchParams` to honour a
 * `?filter=expiring` deep link from the dashboard. That hook opts the component
 * out of static prerendering, and Next.js requires a `<Suspense>` boundary
 * above it — which a server component can provide and a client one cannot.
 * `page.tsx` is that boundary.
 *
 * The catalogue and the expiry ledger share one screen because a shop owner
 * does not think of them as separate things — they think of "what do I have and
 * what is going bad". Splitting them would mean a second lookup for the single
 * most common question in the business.
 *
 * Quantity is never edited inline. It moves through a sale, a restock or an
 * explicit adjustment, each of which writes an audit entry — so the number
 * always has a reason behind it.
 */

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { SiteFooter } from "@/components/Attribution";
import {
  AlertTriangle,
  Box,
  Check,
  Clock,
  Minus,
  Pencil,
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
  Meter,
  Modal,
  Notice,
  PageHeader,
  PageSkeleton,
  SegmentedControl,
} from "@/components/ui";
import { activeProducts, expiryBuckets } from "@/lib/analytics";
import {
  expiryCaption,
  formatDate,
  healthLabel,
  isISODate,
  todayISO,
} from "@/lib/dates";
import { formatMoney, inputToMoney, moneyToInput } from "@/lib/money";
import { suggestedExpiry } from "@/lib/store";
import { useStore } from "@/lib/store-context";
import {
  CATEGORIES,
  UNITS,
  UNIT_LABEL,
  type Category,
  type Product,
  type StockHealth,
  type Unit,
} from "@/lib/types";

type Filter = "all" | "expiring" | "low" | "expired" | "none";

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  expiring: "Expiring",
  low: "Low stock",
  expired: "Expired",
  none: "No expiry",
};

const HEALTH_TEXT: Record<StockHealth, string> = {
  expired: "text-danger",
  critical: "text-urgent",
  warning: "text-notice",
  fresh: "text-success",
  none: "text-ink-faint",
};

export default function StockPage() {
  const store = useStore();
  const { products, settings, hydrated } = store;
  const searchParams = useSearchParams();

  const [filter, setFilter] = useState<Filter>(
    (searchParams.get("filter") as Filter) ?? "all",
  );
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [writeOff, setWriteOff] = useState<Product | null>(null);

  const buckets = useMemo(
    () => expiryBuckets(products, settings),
    [products, settings],
  );
  const healthOf = useMemo(
    () => new Map(buckets.map((b) => [b.productId, b])),
    [buckets],
  );

  const live = useMemo(() => activeProducts(products), [products]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return live.filter((product) => {
      if (needle) {
        const haystack =
          `${product.name} ${product.sku} ${product.category} ${product.supplier} ${product.hsn}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      const bucket = healthOf.get(product.id);
      const health = bucket?.health ?? "none";

      switch (filter) {
        case "expiring":
          return (
            health === "warning" ||
            health === "critical" ||
            (bucket !== undefined && bucket.daysLeft >= 0 && bucket.daysLeft <= settings.expiryWarnDays)
          );
        case "low":
          return product.reorderAt > 0 && product.qty <= product.reorderAt;
        case "expired":
          return health === "expired";
        case "none":
          return product.expiry === null;
        default:
          return true;
      }
    });
  }, [live, query, filter, healthOf, settings.expiryWarnDays]);

  if (!hydrated) return <PageSkeleton stats={3} />;

  const expiringCount = buckets.filter(
    (b) => b.health === "expired" || b.health === "critical" || b.health === "warning",
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Stock & expiry"
        description="Everything on your shelf, with expiry dates and reorder points. Quantity changes through a bill, a restock or an adjustment."
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="neu-btn neu-btn-primary"
          >
            <Plus size={18} weight="bold" /> Add product
          </button>
        }
      />

      {expiringCount > 0 && (
        <div className="mt-6">
          <Notice tone="warn">
            {expiringCount} {expiringCount === 1 ? "line needs" : "lines need"} attention
            for expiry. Filter by Expiring below to see them.
          </Notice>
        </div>
      )}

      {/* Search and filters. */}
      <div className="mt-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative lg:max-w-xs lg:flex-1">
          <Search
            size={17}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, SKU or HSN…"
            aria-label="Search products"
            className="neu-input !pl-11"
          />
        </div>

        <SegmentedControl
          label="Filter products"
          value={filter}
          onChange={setFilter}
          options={(Object.keys(FILTER_LABEL) as Filter[]).map((key) => ({
            value: key,
            label: FILTER_LABEL[key],
          }))}
        />
      </div>

      <p className="mt-4 text-sm font-semibold text-ink-muted">
        {visible.length} of {live.length} products
      </p>

      {/* Product list. */}
      <div className="mt-4">
        {visible.length === 0 ? (
          <EmptyState
            title={live.length === 0 ? "No products yet" : "Nothing matches"}
            description={
              live.length === 0
                ? "Add the items you sell. Once they are here, KiranaTrack watches their expiry dates and margins for you."
                : "Try a different search or filter."
            }
            icon={<Box size={30} />}
            action={
              live.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="neu-btn neu-btn-primary"
                >
                  <Plus size={18} /> Add product
                </button>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-4">
            {visible.map((product) => {
              const bucket = healthOf.get(product.id);
              const health = bucket?.health ?? "none";
              const margin =
                product.sellPrice === 0
                  ? 0
                  : ((product.sellPrice - product.costPrice) / product.sellPrice) * 100;
              const low = product.reorderAt > 0 && product.qty <= product.reorderAt;

              return (
                <li key={product.id}>
                  <Card className="!p-0">
                    <div className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-lg font-bold text-ink">
                              {product.name}
                            </h3>
                            {health !== "fresh" && health !== "none" && (
                              <span
                                className={`inline-flex items-center gap-1 rounded-full bg-shadow-dark/25 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider ${HEALTH_TEXT[health]}`}
                              >
                                {health === "expired" ? (
                                  <AlertTriangle size={12} />
                                ) : (
                                  <Clock size={12} />
                                )}
                                {healthLabel(health)}
                              </span>
                            )}
                            {low && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-notice/15 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-notice">
                                <Minus size={12} /> Low
                              </span>
                            )}
                          </div>

                          <p className="tabular mt-1 text-xs font-semibold text-ink-faint">
                            {product.sku || "No SKU"} · {product.category} · HSN{" "}
                            {product.hsn || "—"}
                            {product.location && ` · ${product.location}`}
                          </p>
                        </div>

                        <div className="flex shrink-0 gap-2">
                          <IconButton
                            label={`Edit ${product.name}`}
                            onClick={() => setEditing(product)}
                          >
                            <Pencil size={16} />
                          </IconButton>
                          <IconButton
                            label={`Write off ${product.name}`}
                            onClick={() => setWriteOff(product)}
                            tone="danger"
                          >
                            <Trash size={16} />
                          </IconButton>
                        </div>
                      </div>

                      {/* Numbers. */}
                      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <Figure label="In stock">
                          <span className="tabular font-display text-xl font-bold text-ink">
                            {product.qty}
                          </span>
                          <span className="ml-1 text-xs font-semibold text-ink-faint">
                            {UNIT_LABEL[product.unit]}
                          </span>
                        </Figure>

                        <Figure label="Sell price">
                          <span className="tabular font-display text-xl font-bold text-ink">
                            {formatMoney(product.sellPrice)}
                          </span>
                        </Figure>

                        <Figure label="Cost">
                          <span className="tabular font-display text-xl font-bold text-ink-muted">
                            {formatMoney(product.costPrice)}
                          </span>
                        </Figure>

                        <Figure label="Margin">
                          <span
                            className={`tabular font-display text-xl font-bold ${
                              margin < 5
                                ? "text-danger"
                                : margin < 10
                                  ? "text-notice"
                                  : "text-success"
                            }`}
                          >
                            {margin.toFixed(0)}%
                          </span>
                        </Figure>
                      </div>

                      {/* Expiry and reorder. */}
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="neu-inset-sm px-4 py-3">
                          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-muted">
                            Expiry
                          </p>
                          {product.expiry ? (
                            <p className="tabular mt-1 text-sm font-bold">
                              <span className={HEALTH_TEXT[health]}>
                                {formatDate(product.expiry)}
                              </span>
                              <span className="ml-2 font-semibold text-ink-muted">
                                {expiryCaption(product.expiry)}
                              </span>
                            </p>
                          ) : (
                            <p className="mt-1 text-sm font-semibold text-ink-faint">
                              Not tracked — set one in Edit
                            </p>
                          )}
                        </div>

                        <div className="neu-inset-sm px-4 py-3">
                          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-muted">
                            Stock level
                          </p>
                          {product.reorderAt > 0 ? (
                            <>
                              <p className="tabular mt-1 text-sm font-bold text-ink-muted">
                                {product.qty} of {product.reorderAt} before reorder
                              </p>
                              <div className="mt-2">
                                <Meter
                                  value={product.qty}
                                  max={Math.max(product.reorderAt * 2, product.qty, 1)}
                                  tone={
                                    product.qty <= product.reorderAt ? "danger" : "success"
                                  }
                                  label={`${product.name} stock against reorder point`}
                                />
                              </div>
                            </>
                          ) : (
                            <p className="mt-1 text-sm font-semibold text-ink-faint">
                              No reorder point set
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Restock shortcut — the other way quantity normally increases. */}
      <div className="mt-8">
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="neu-well grid size-11 shrink-0 place-items-center text-brand">
              <Truck size={21} />
            </span>
            <div>
              <p className="font-display text-lg font-bold text-ink">
                Received stock from a supplier?
              </p>
              <p className="mt-0.5 text-sm font-medium text-ink-muted">
                Record a restock bill — it adds quantity, updates today&apos;s cost
                and refreshes the received date in one step.
              </p>
            </div>
          </div>
          <a href="/restock" className="neu-btn neu-btn-primary shrink-0">
            Record restock
          </a>
        </Card>
      </div>

      {/*
        Mounted only while open, and keyed by target.

        This is the React-idiomatic way to seed a form from props: the component
        remounts whenever the target changes, so each field's initial value can
        come from a `useState` initialiser. An effect that copies props into
        state instead runs *after* the first paint, which shows the previous
        product's values for a frame — on an edit dialog, visibly wrong.
      */}
      {creating || editing !== null ? (
        <ProductForm
          key={editing?.id ?? "new"}
          product={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}

      <WriteOffDialog product={writeOff} onClose={() => setWriteOff(null)} />

      <SiteFooter />
    </>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="neu-inset-sm px-4 py-3">
      <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-muted">
        {label}
      </p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}

/* ==========================================================================
   Add / edit form
   ========================================================================== */

/**
 * Add / edit dialog.
 *
 * Mounted only while open and keyed by target by its parent, so every field
 * seeds straight from props through a `useState` initialiser. There is no
 * syncing effect: this component's whole lifetime is one open dialog.
 */
function ProductForm({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const store = useStore();
  const editing = product !== null;

  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [category, setCategory] = useState<Category>(product?.category ?? "Grocery");
  const [unit, setUnit] = useState<Unit>(product?.unit ?? "pc");
  const [qty, setQty] = useState(String(product?.qty ?? 0));
  const [cost, setCost] = useState(product ? moneyToInput(product.costPrice) : "");
  const [sell, setSell] = useState(product ? moneyToInput(product.sellPrice) : "");
  const [taxRate, setTaxRate] = useState(
    String(product?.taxRate ?? store.settings.defaultTaxRate),
  );
  const [expiry, setExpiry] = useState(product?.expiry ?? "");
  const [receivedOn, setReceivedOn] = useState(product?.receivedOn ?? todayISO());
  const [reorderAt, setReorderAt] = useState(String(product?.reorderAt ?? 0));
  const [supplier, setSupplier] = useState(product?.supplier ?? "");
  const [hsn, setHsn] = useState(product?.hsn ?? "");
  const [location, setLocation] = useState(product?.location ?? "");
  const [message, setMessage] = useState<string | null>(null);

  function submit() {
    const draft = {
      name,
      sku,
      category,
      unit,
      qty: Number.parseFloat(qty) || 0,
      costPrice: inputToMoney(cost),
      sellPrice: inputToMoney(sell),
      taxRate: Number.parseInt(taxRate, 10) || 0,
      expiry: expiry === "" ? null : expiry,
      receivedOn,
      reorderAt: Number.parseInt(reorderAt, 10) || 0,
      supplier: supplier.trim(),
      hsn: hsn.trim(),
      location: location.trim(),
    };

    const result = editing && product
      ? store.updateProduct(product.id, draft)
      : store.addProduct(draft);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    onClose();
  }

  /*
   * Live margin.
   *
   * Shown while typing rather than after saving, because a price entered into
   * a blank form is exactly where the mistake happens — and a 3% margin caught
   * here is free, where caught after a month of selling it is not.
   */
  const costPaise = inputToMoney(cost);
  const sellPaise = inputToMoney(sell);
  const marginPreview = sellPaise === 0 ? null : ((sellPaise - costPaise) / sellPaise) * 100;

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit ${product.name}` : "Add a product"}
      wide
      footer={
        <>
          <button type="button" className="neu-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neu-btn neu-btn-primary" onClick={submit}>
            <Check size={18} /> {editing ? "Save changes" : "Add product"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {message && <Notice tone="danger">{message}</Notice>}

        <Field label="Product name">
          <input
            className="neu-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Amul Butter 500g"
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU / code" hint="Your own shelf code. Leave blank if unused.">
            <input
              className="neu-input"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="DRY-BTR-500"
            />
          </Field>

          <Field label="Category">
            <select
              className="neu-input"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Quantity in stock">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className="neu-input neu-input-money"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </Field>

          <Field label="Sold by">
            <select
              className="neu-input"
              value={unit}
              onChange={(e) => setUnit(e.target.value as Unit)}
            >
              {UNITS.map((option) => (
                <option key={option} value={option}>
                  {UNIT_LABEL[option]}
                    </option>
              ))}
            </select>
          </Field>

          <Field label="Reorder at" hint="Warn me below this.">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              className="neu-input neu-input-money"
              value={reorderAt}
              onChange={(e) => setReorderAt(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Cost price (₹)">
            <input
              type="text"
              inputMode="decimal"
              className="neu-input neu-input-money"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="245.00"
            />
          </Field>

          <Field label="Sell price (₹)">
            <input
              type="text"
              inputMode="decimal"
              className="neu-input neu-input-money"
              value={sell}
              onChange={(e) => setSell(e.target.value)}
              placeholder="280.00"
            />
          </Field>

          <Field label="GST %">
            <select
              className="neu-input"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
            >
              {[0, 5, 12, 18, 28].map((rate) => (
                <option key={rate} value={rate}>
                  {rate}%
                </option>
              ))}
            </select>
          </Field>
        </div>

        {marginPreview !== null && (
          <p
            className={`text-sm font-bold ${
              marginPreview < 5
                ? "text-danger"
                : marginPreview < 10
                  ? "text-notice"
                  : "text-success"
            }`}
          >
            {marginPreview.toFixed(1)}% margin
            {marginPreview < 0
              ? " — you lose money on every sale of this."
              : marginPreview < 5
                ? " — thin. Check similar items in this category."
                : ""}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Expiry date"
            hint={
              expiry === ""
                ? "Leave blank for non-perishables like rice, oil or soap."
                : undefined
            }
          >
            <input
              type="date"
              className="neu-input neu-input-money"
              value={expiry}
              min={isISODate(expiry) ? undefined : undefined}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </Field>

          <Field label="Received on">
            <input
              type="date"
              className="neu-input neu-input-money"
              value={receivedOn}
              onChange={(e) => setReceivedOn(e.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="neu-btn neu-btn-sm"
            onClick={() => {
              const guess = suggestedExpiry(category);
              if (guess) setExpiry(guess);
            }}
          >
            <Clock size={15} /> Guess from category
          </button>
          {expiry !== "" && (
            <button
              type="button"
              className="neu-btn neu-btn-sm"
              onClick={() => setExpiry("")}
            >
              Clear expiry
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Supplier">
            <input
              className="neu-input"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Amul Distributor"
            />
          </Field>

          <Field label="HSN code">
            <input
              className="neu-input neu-input-money"
              value={hsn}
              onChange={(e) => setHsn(e.target.value)}
              placeholder="0405"
            />
          </Field>

          <Field label="Shelf / rack">
            <input
              className="neu-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Fridge 1"
            />
          </Field>
        </div>

        {editing && product && (
          <Notice tone="warn">
            Quantity is left as {product.qty} — change it through a restock or a
            bill so the reason for the change is recorded.
          </Notice>
        )}

        {marginPreview !== null && (
          <p className="text-xs font-medium text-ink-faint">
            That is {formatMoney(sellPaise - costPaise)} profit per{" "}
            {UNIT_LABEL[unit].toLowerCase()} sold.
          </p>
        )}
      </div>
    </Modal>
  );
}

/* ==========================================================================
   Write-off
   ========================================================================== */

function WriteOffDialog({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const store = useStore();
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (!product) return null;

  const amount = Number.parseFloat(qty) || 0;
  const loss = Math.round(product.costPrice * amount);

  function confirm() {
    const result = store.writeOff(product!.id, amount, reason);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setQty("");
    setReason("");
    setMessage(null);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Write off ${product.name}`}
      footer={
        <>
          <button type="button" className="neu-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="neu-btn neu-btn-danger"
            onClick={confirm}
            disabled={amount <= 0}
          >
            <Trash size={18} /> Write off
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {message && <Notice tone="danger">{message}</Notice>}

        <p className="text-sm font-medium leading-relaxed text-ink-muted">
          {product.qty} {UNIT_LABEL[product.unit].toLowerCase()} in stock at{" "}
          {formatMoney(product.costPrice)} each. Writing stock off removes it from
          your shelf and records the loss, so your stock value stays honest.
        </p>

        <Field
          label="How many to write off"
          hint={`Up to ${product.qty}.`}
        >
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max={product.qty}
            step="any"
            className="neu-input neu-input-money"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Reason" hint="Kept in the activity log so you can see what happened.">
          <input
            className="neu-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Expired, damaged, or returned to supplier"
          />
        </Field>

        {amount > 0 && (
          <Notice tone="warn">
            This records a loss of {formatMoney(loss)} against your stock value.
            It cannot be undone — re-add the product from Restock if it comes back.
          </Notice>
        )}
      </div>
    </Modal>
  );
}
