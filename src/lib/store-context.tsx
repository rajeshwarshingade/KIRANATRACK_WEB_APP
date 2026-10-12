"use client";

/**
 * The store context.
 *
 * Holds the five independent slices of the database and exposes the write
 * actions. Each slice persists under its own key rather than as one document,
 * because the access pattern is highly asymmetric: every sale writes `sales`,
 * `products`, `events` and `settings`, but a screen that only reads settings
 * (the billing screen's store name) should not serialise the whole product
 * catalogue to get it. Splitting also keeps a single corrupt key from taking
 * the entire shop's data with it.
 *
 * The mutation functions themselves live in `store.ts` as pure functions over a
 * `Database`. This file's only job is to wire them to React state and surface
 * the result message — which keeps every business rule testable without a
 * renderer, and keeps `store.ts` free of React entirely.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

import {
  activeProducts,
  stockValue,
} from "./analytics";
import { buildDemoDatabase } from "./seed";
import {
  clearAllData,
  readKey,
  storageAvailable,
  useHydrated,
  usePersistentState,
} from "./storage";
import {
  addProduct as addProductAction,
  archiveProduct as archiveProductAction,
  changePrice as changePriceAction,
  clearEventLog as clearEventLogAction,
  emptyDatabase,
  recordPurchase as recordPurchaseAction,
  recordSale as recordSaleAction,
  setExpiry as setExpiryAction,
  setPrice as setPriceAction,
  setReorderPoint as setReorderPointAction,
  updateProduct as updateProductAction,
  updateSettings as updateSettingsAction,
  validateSale,
  writeOffStock as writeOffStockAction,
  type ActionResult,
  type ProductInput,
  type PurchaseDraft,
  type SaleDraft,
} from "./store";
import type {
  ActivityEvent,
  Database,
  Product,
  Purchase,
  Sale,
  Settings,
} from "./types";

interface StoreContextValue {
  products: Product[];
  sales: Sale[];
  purchases: Purchase[];
  events: ActivityEvent[];
  settings: Settings;

  /** True once localStorage has been read. Pages gate their data UI on this. */
  hydrated: boolean;
  /** False when the browser refuses to persist — surfaced as a warning. */
  persistent: boolean;
  /** True when the catalogue holds only the seeded demo shop. */
  isDemo: boolean;

  // Reads
  productById: (id: string) => Product | undefined;
  stockTotalValue: number;

  // Writes. Each returns an ActionResult so the caller can show the message.
  addProduct: (input: ProductInput) => ActionResult;
  updateProduct: (id: string, changes: Partial<ProductInput>) => ActionResult;
  archiveProduct: (id: string) => ActionResult;
  recordSale: (draft: SaleDraft) => ActionResult;
  checkSale: (draft: SaleDraft) => { ok: true } | { ok: false; message: string };
  recordPurchase: (draft: PurchaseDraft) => ActionResult;
  writeOff: (productId: string, qty: number, reason: string) => ActionResult;
  setExpiry: (productId: string, expiry: string | null) => ActionResult;
  setReorderPoint: (productId: string, value: number) => ActionResult;
  changePrice: (productId: string, pct: number) => ActionResult;
  setPrice: (productId: string, price: number) => ActionResult;
  updateSettings: (changes: Partial<Settings>) => ActionResult;

  // Whole-database operations
  clearEventLog: () => ActionResult;
  /** Replace every slice at once, used by backup restore. */
  replaceAll: (data: Database) => void;
  loadDemoData: () => void;
  eraseEverything: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

/**
 * Module-level empty collections.
 *
 * These are passed as the `initial` value to `usePersistentState`, which uses
 * them as a `useSyncExternalStore` snapshot. That requires a referentially
 * stable value across renders, so an inline `[]` literal here would create a new
 * array each render and resubscribe on every one.
 */
const NO_PRODUCTS: Product[] = [];
const NO_SALES: Sale[] = [];
const NO_PURCHASES: Purchase[] = [];
const NO_EVENTS: ActivityEvent[] = [];

const DEFAULT_SETTINGS = emptyDatabase().settings;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = usePersistentState<Product[]>(
    "products",
    NO_PRODUCTS,
  );
  const [sales, setSales] = usePersistentState<Sale[]>("sales", NO_SALES);
  const [purchases, setPurchases] = usePersistentState<Purchase[]>(
    "purchases",
    NO_PURCHASES,
  );
  const [events, setEvents] = usePersistentState<ActivityEvent[]>(
    "events",
    NO_EVENTS,
  );
  const [settings, setSettings] = usePersistentState<Settings>(
    "settings",
    DEFAULT_SETTINGS,
  );

  /*
   * `useHydrated` reports whether React has swapped the server snapshot for the
   * real one. Until it does, every value above is the server-rendered default,
   * which is exactly what the first client paint must show.
   */
  const hydrated = useHydrated();

  /*
   * Storage capability is probed lazily and cached in the storage module, so it
   * costs one write-and-remove per page load. Reading it during render is safe
   * because the probe is idempotent and memoised.
   */
  const persistent = hydrated ? storageAvailable() : true;

  /*
   * First-run seed.
   *
   * Deferred to a microtask rather than run synchronously in an effect body.
   * Two reasons: it must not run before the stored slices have been adopted, or
   * it would overwrite real data with the demo shop; and doing external writes
   * during the hydration commit blocks that commit for no reason. By the time a
   * microtask runs, the stored values are already adopted and the decision below
   * is made against the real data.
   */
  useEffect(() => {
    if (!hydrated) return;

    queueMicrotask(() => {
      const hasAnyRecord =
        readKey<Product[]>("products", NO_PRODUCTS).length > 0 ||
        readKey<Sale[]>("sales", NO_SALES).length > 0;

      if (hasAnyRecord) return;
      if (!readKey<Settings>("settings", DEFAULT_SETTINGS).demoDataOn) return;

      const demo = buildDemoDatabase();
      setProducts(demo.products);
      setSales(demo.sales);
      setPurchases(demo.purchases);
      setEvents(demo.events);
      // The demo profile is written too, so the app does not open showing
      // "My Kirana Store" over a shop full of somebody else's stock.
      setSettings(demo.settings);
    });
  }, [hydrated, setProducts, setSales, setPurchases, setEvents, setSettings]);

  /**
   * Apply a pure mutation to the assembled database and write back only the
   * slices the mutation actually touched.
   *
   * Writing all five slices on every action would be wasteful and, worse, would
   * mean a settings change could clobber a products change made in another tab
   * microseconds earlier. Each action therefore declares what it changes.
   */
  const run = useCallback(
    (
      mutate: (db: Database) => [Database, ActionResult],
      touched: (keyof Database)[],
    ): ActionResult => {
      const db: Database = { products, sales, purchases, events, settings };
      const [next, result] = mutate(db);

      if (touched.includes("products")) setProducts(next.products);
      if (touched.includes("sales")) setSales(next.sales);
      if (touched.includes("purchases")) setPurchases(next.purchases);
      if (touched.includes("events")) setEvents(next.events);
      if (touched.includes("settings")) setSettings(next.settings);

      return result;
    },
    [products, sales, purchases, events, settings, setProducts, setSales, setPurchases, setEvents, setSettings],
  );

  const addProduct = useCallback(
    (input: ProductInput) =>
      run((db) => addProductAction(db, input), ["products", "events"]),
    [run],
  );

  const updateProduct = useCallback(
    (id: string, changes: Partial<ProductInput>) =>
      run((db) => updateProductAction(db, id, changes), ["products", "events"]),
    [run],
  );

  const archiveProduct = useCallback(
    (id: string) => run((db) => archiveProductAction(db, id), ["products", "events"]),
    [run],
  );

  const recordSale = useCallback(
    (draft: SaleDraft) =>
      run((db) => recordSaleAction(db, draft), ["products", "sales", "events"]),
    [run],
  );

  const recordPurchase = useCallback(
    (draft: PurchaseDraft) =>
      run((db) => recordPurchaseAction(db, draft), ["products", "purchases", "events"]),
    [run],
  );

  const writeOff = useCallback(
    (productId: string, qty: number, reason: string) =>
      run((db) => writeOffStockAction(db, productId, qty, reason), ["products", "events"]),
    [run],
  );

  const setExpiry = useCallback(
    (productId: string, expiry: string | null) =>
      run((db) => setExpiryAction(db, productId, expiry), ["products", "events"]),
    [run],
  );

  const setReorderPoint = useCallback(
    (productId: string, value: number) =>
      run((db) => setReorderPointAction(db, productId, value), ["products", "events"]),
    [run],
  );

  const changePrice = useCallback(
    (productId: string, pct: number) =>
      run((db) => changePriceAction(db, productId, pct), ["products", "events"]),
    [run],
  );

  const setPrice = useCallback(
    (productId: string, price: number) =>
      run((db) => setPriceAction(db, productId, price), ["products", "events"]),
    [run],
  );

  const updateSettings = useCallback(
    (changes: Partial<Settings>) =>
      run((db) => updateSettingsAction(db, changes), ["settings", "events"]),
    [run],
  );

  const clearEventLog = useCallback(
    () => run((db) => clearEventLogAction(db), ["events"]),
    [run],
  );

  const replaceAll = useCallback(
    (data: Database) => {
      setProducts(data.products);
      setSales(data.sales);
      setPurchases(data.purchases);
      setEvents(data.events);
      setSettings(data.settings);
    },
    [setProducts, setSales, setPurchases, setEvents, setSettings],
  );

  const loadDemoData = useCallback(() => {    const demo = buildDemoDatabase();
    setProducts(demo.products);
    setSales(demo.sales);
    setPurchases(demo.purchases);
    setEvents(demo.events);
    setSettings(demo.settings);
  }, [setProducts, setSales, setPurchases, setEvents, setSettings]);

  const eraseEverything = useCallback(() => {
    clearAllData();
    const blank = emptyDatabase();
    setProducts(blank.products);
    setSales(blank.sales);
    setPurchases(blank.purchases);
    setEvents(blank.events);
    setSettings(blank.settings);
  }, [setProducts, setSales, setPurchases, setEvents, setSettings]);

  const productById = useCallback(
    (id: string) => products.find((p) => p.id === id),
    [products],
  );

  const stockTotalValue = useMemo(
    () => stockValue(activeProducts(products)),
    [products],
  );

  const isDemo = useMemo(
    () => settings.profile.name === "Sharma General Store" && settings.demoDataOn === false,
    [settings.profile.name, settings.demoDataOn],
  );

  const value = useMemo<StoreContextValue>(
    () => ({
      products,
      sales,
      purchases,
      events,
      settings,
      hydrated,
      persistent,
      isDemo,
      productById,
      stockTotalValue,
      addProduct,
      updateProduct,
      archiveProduct,
      recordSale,
      checkSale: (draft) => validateSale({ products, sales, purchases, events, settings }, draft),
      recordPurchase,
      writeOff,
      setExpiry,
      setReorderPoint,
      changePrice,
      setPrice,
      updateSettings,
      clearEventLog,
      replaceAll,
      loadDemoData,
      eraseEverything,
    }),
    [
      products, sales, purchases, events, settings, hydrated, persistent, isDemo,
      productById, stockTotalValue, addProduct, updateProduct, archiveProduct,
      recordSale, recordPurchase, writeOff, setExpiry, setReorderPoint,
      changePrice, setPrice, updateSettings, clearEventLog, replaceAll,
      loadDemoData, eraseEverything,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/**
 * Access the store.
 *
 * Throws outside a provider rather than returning a nullable context, so a
 * missing provider is a loud failure at the point of the mistake instead of an
 * undefined-property crash three components later.
 */
export function useStore(): StoreContextValue {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used inside a StoreProvider.");
  }
  return context;
}
