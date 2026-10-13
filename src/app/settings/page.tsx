"use client";

/**
 * Settings.
 *
 * Grouped by what the owner came here to change:
 *
 *  1. **Shop identity** — appears on every bill and receipt.
 *  2. **Alerts** — when stock counts as expiring. Their call, not the app's.
 *  3. **AI** — optional, and off by default.
 *  4. **Your data** — backup, export, restore, erase. Local-first storage has
 *     one real weakness, and it is this section that answers it.
 *  5. **About** — who built it and who owns it.
 *
 * The data section is deliberately not buried. Data that lives only on one
 * device is data that can be lost, and the owner has to be able to reach the
 * backup without reading a manual.
 */

import { useMemo, useRef, useState } from "react";

import { SiteFooter, StudioCard } from "@/components/Attribution";
import {
  Download,
  Info,
  Shield,
  Sparkle,
  Trash,
  Upload,
} from "@/components/Icons";import {
  Card,
  ConfirmDialog,
  Field,
  Notice,
  PageHeader,
  PageSkeleton,
  SectionLabel,
  Toggle,
} from "@/components/ui";
import {
  backupFilename,
  downloadText,
  exportSalesCsv,
  exportStockCsv,
  parseBackup,
  serialiseBackup,
} from "@/lib/backup";
import { AI_PROVIDERS, defaultModelFor } from "@/lib/ai";
import { formatBytes, storageFootprint } from "@/lib/storage";
import { useStore } from "@/lib/store-context";
import { STUDIO } from "@/lib/studio";
import type { Database } from "@/lib/types";

export default function SettingsPage() {
  const store = useStore();
  const { settings, products, sales, purchases, hydrated } = store;

  const [saved, setSaved] = useState<string | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSummary, setRestoreSummary] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  /*
   * Storage footprint.
   *
   * Measured lazily rather than on every render — it walks localStorage, which is
   * synchronous and would otherwise run on every keystroke in any field on this
   * page. Keyed on the record counts, which are the only things that move the
   * total meaningfully, so it stays accurate as the owner works without
   * recomputing per character typed.
   */
  const footprint = useMemo(
    () => (hydrated ? storageFootprint() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on counts on purpose
    [hydrated, products.length, sales.length, purchases.length],
  );

  if (!hydrated) return <PageSkeleton stats={3} />;

  function persist(message: string) {
    setSaved(message);
    setTimeout(() => setSaved(null), 3000);
  }

  function saveProfile(changes: Partial<typeof settings.profile>) {
    store.updateSettings({ profile: { ...settings.profile, ...changes } });
    persist("Shop details saved.");
  }

  function restoreFromFile(file: File) {
    setRestoreError(null);
    setRestoreSummary(null);

    const reader = new FileReader();
    reader.onload = () => {
      const result = parseBackup(String(reader.result));

      if (!result.ok) {
        setRestoreError(result.error);
        return;
      }

      const data = result.data as Database;
      // Restore is destructive, so it goes through the same write path as every
      // other change — which also means the slices stay in sync across tabs.
      store.replaceAll(data);
      setRestoreSummary(`Backup restored — ${result.summary}`);
    };
    reader.onerror = () => {
      setRestoreError("That file could not be read.");
    };
    reader.readAsText(file);
  }

  return (
    <>
      <PageHeader
        eyebrow="Setup"
        title="Settings"
        description="Shop details, alert thresholds, optional AI, and full control over your data."
      />

      {saved && (
        <div className="mt-6">
          <Notice tone="success">{saved}</Notice>
        </div>
      )}

      {/* Shop identity. */}
      <section className="mt-9">
        <SectionLabel>Shop details</SectionLabel>
        <p className="mt-1.5 text-sm font-medium text-ink-muted">
          These appear on every bill and receipt you print.
        </p>

        <Card className="mt-4 space-y-5">
          <Field label="Shop name">
            <input
              className="neu-input"
              defaultValue={settings.profile.name}
              onBlur={(event) => {
                if (event.target.value.trim() !== settings.profile.name) {
                  saveProfile({ name: event.target.value });
                }
              }}
              placeholder="Sharma General Store"
            />
          </Field>

          <Field label="Owner name">
            <input
              className="neu-input"
              defaultValue={settings.profile.owner}
              onBlur={(event) => {
                if (event.target.value.trim() !== settings.profile.owner) {
                  saveProfile({ owner: event.target.value });
                }
              }}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone">
              <input
                className="neu-input neu-input-money"
                type="tel"
                inputMode="numeric"
                defaultValue={settings.profile.phone}
                onBlur={(event) => saveProfile({ phone: event.target.value })}
              />
            </Field>

            <Field label="GSTIN" hint="15 characters. Printed on every invoice.">
              <input
                className="neu-input neu-input-money uppercase"
                defaultValue={settings.profile.gstin}
                onBlur={(event) =>
                  saveProfile({ gstin: event.target.value.toUpperCase() })
                }
                placeholder="23AABCS1429B1ZX"
              />
            </Field>
          </div>

          <Field label="Address">
            <input
              className="neu-input"
              defaultValue={settings.profile.address}
              onBlur={(event) => saveProfile({ address: event.target.value })}
              placeholder="Shop 14, Main Market Road, Indore 452001"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="State">
              <input
                className="neu-input"
                defaultValue={settings.profile.state}
                onBlur={(event) => saveProfile({ state: event.target.value })}
              />
            </Field>

            <Field
              label="State code"
              hint="Decides whether a sale is CGST+SGST or IGST."
            >
              <input
                className="neu-input neu-input-money"
                inputMode="numeric"
                maxLength={2}
                defaultValue={settings.profile.stateCode}
                onBlur={(event) => {
                  const code = event.target.value.replace(/\D/g, "").slice(0, 2);
                  if (code !== settings.profile.stateCode) saveProfile({ stateCode: code });
                }}
              />
            </Field>
          </div>
        </Card>
      </section>

      {/* Alerts. */}
      <section className="mt-9">
        <SectionLabel>Alerts & defaults</SectionLabel>

        <Card className="mt-4 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={`Warn ${settings.expiryWarnDays} days before expiry`}
              hint="Items inside this window show as amber."
            >
              <input
                type="range"
                min="3"
                max="60"
                value={settings.expiryWarnDays}
                onChange={(event) =>
                  store.updateSettings({
                    expiryWarnDays: Number.parseInt(event.target.value, 10),
                  })
                }
                className="neu-range"
              />
              <div className="mt-2 flex gap-2">
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => store.updateSettings({ expiryWarnDays: days })}
                    className={`neu-btn neu-btn-sm !min-h-0 !px-3 !py-1.5 !text-[0.7rem] ${
                      settings.expiryWarnDays === days ? "neu-tab-active" : ""
                    }`}
                  >
                    {days} days
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label={`Urgent at ${settings.expiryCriticalDays} days`}
              hint="Inside this window shows as red."
            >
              <input
                type="range"
                min="0"
                max="14"
                value={settings.expiryCriticalDays}
                onChange={(event) =>
                  store.updateSettings({
                    expiryCriticalDays: Number.parseInt(event.target.value, 10),
                  })
                }
                className="neu-range"
              />
            </Field>
          </div>

          <Field label="Day starts at" hint="Bills after midnight count to this day.">
            <input
              type="time"
              className="neu-input neu-input-money !max-w-40"
              value={settings.dayStart}
              onChange={(event) => store.updateSettings({ dayStart: event.target.value })}
            />
          </Field>

          <Field label="Default GST % for new products">
            <select
              className="neu-input !max-w-40"
              value={settings.defaultTaxRate}
              onChange={(event) =>
                store.updateSettings({
                  defaultTaxRate: Number.parseInt(event.target.value, 10),
                })
              }
            >
              {[0, 5, 12, 18, 28].map((rate) => (
                <option key={rate} value={rate}>
                  {rate}%
                </option>
              ))}
            </select>
          </Field>

          <Toggle
            checked={settings.lowStockOn}
            onChange={(next) => store.updateSettings({ lowStockOn: next })}
            label="Warn me about low stock"
          />
        </Card>
      </section>

      {/* AI — optional, and honest about being optional. */}
      <section className="mt-9">
        <SectionLabel>AI briefing (optional)</SectionLabel>

        <Card className="mt-4 space-y-5">
          <div className="flex items-start gap-4">
            <span className="neu-well grid size-11 shrink-0 place-items-center text-brand">
              <Sparkle size={21} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg font-bold text-ink">
                Explain the advisor in plain English
              </p>
              <p className="mt-1 text-sm font-medium leading-relaxed text-ink-muted">
                The advisor itself already works with no key and no internet — it
                reads your own records and applies the advice in one tap. Adding a
                key only lets a language model write that analysis up as a short
                briefing you can read at the start of the day.
              </p>
            </div>
          </div>

          <Notice tone="brand">
            Your key is stored on this device only. It is never included in a
            backup file, and customer names and phone numbers are never sent to
            the provider — only the advisor&apos;s own findings.
          </Notice>

          <Field label="Provider">
            <select
              className="neu-input"
              value={settings.ai.provider ?? ""}
              onChange={(event) => {
                const provider = event.target.value || null;
                store.updateSettings({
                  ai: {
                    ...settings.ai,
                    provider: provider as typeof settings.ai.provider,
                    model: provider ? defaultModelFor(provider) : "",
                  },
                });
              }}
            >
              <option value="">None — offline analysis only</option>
              {AI_PROVIDERS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </Field>

          {settings.ai.provider && (
            <>
              <Field label="API key">
                <input
                  className="neu-input"
                  type="password"
                  autoComplete="off"
                  value={settings.ai.apiKey}
                  onChange={(event) =>
                    store.updateSettings({
                      ai: { ...settings.ai, apiKey: event.target.value },
                    })
                  }
                  placeholder="sk-…"
                />
              </Field>

              <Field label="Model" hint="Leave blank to use the provider's default.">
                <input
                  className="neu-input"
                  value={settings.ai.model}
                  onChange={(event) =>
                    store.updateSettings({
                      ai: { ...settings.ai, model: event.target.value },
                    })
                  }
                  placeholder={defaultModelFor(settings.ai.provider)}
                />
              </Field>
            </>
          )}
        </Card>
      </section>

      {/* Data. */}
      <section className="mt-9">
        <SectionLabel>Your data</SectionLabel>
        <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink-muted">
          Everything lives on this device. Take a backup regularly — it is the
          only copy, and a lost phone means a lost ledger.
        </p>

        {footprint && (
          <div className="mt-4">
            <Notice tone={store.persistent ? "brand" : "warn"}>
              {store.persistent ? (
                <>
                  Using {formatBytes(footprint.bytes)} across {footprint.keys}{" "}
                  stored record{footprint.keys === 1 ? "" : "s"} ·{" "}
                  {products.length} products, {sales.length} bills,{" "}
                  {purchases.length} restocks.
                </>
              ) : (
                <>
                  This browser is refusing to save data, so nothing here will
                  survive closing the app. Use a normal browsing window, and
                  export a backup before relying on this.
                </>
              )}
            </Notice>
          </div>
        )}

        {restoreSummary && (
          <div className="mt-4">
            <Notice tone="success">{restoreSummary}</Notice>
          </div>
        )}

        {restoreError && (
          <div className="mt-4">
            <Notice tone="danger">{restoreError}</Notice>
          </div>
        )}

        <Card className="mt-4 space-y-4">
          <button
            type="button"
            onClick={() =>
              downloadText(
                backupFilename(),
                serialiseBackup({
                  products,
                  sales,
                  purchases,
                  events: store.events,
                  settings,
                }),
              )
            }
            className="neu-btn neu-btn-primary w-full !justify-start"
          >
            <Download size={18} /> Download a full backup
          </button>

          <p className="text-xs font-medium leading-relaxed text-ink-faint">
            A single JSON file containing your products, every bill, every
            restock and your settings. Keep it somewhere safe — email it to
            yourself once a week. Your API key is deliberately left out.
          </p>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="neu-btn w-full !justify-start"
          >
            <Upload size={18} /> Restore from a backup
          </button>

          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) restoreFromFile(file);
              // Reset so re-picking the same file fires `change` again.
              event.target.value = "";
            }}
          />

          <p className="text-xs font-medium leading-relaxed text-ink-faint">
            Restoring replaces everything currently in the app. It checks the
            file first and refuses anything from a newer version of KiranaTrack,
            so a restore cannot quietly drop fields it does not understand.
          </p>
        </Card>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card className="space-y-3">
            <p className="font-display text-base font-bold text-ink">
              Spreadsheet exports
            </p>
            <p className="text-sm font-medium leading-relaxed text-ink-muted">
              For your accountant, Excel or Tally. These cannot be restored —
              use a backup for that.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  exportSalesCsv({ products, sales, purchases, events: store.events, settings })
                }
                className="neu-btn neu-btn-sm"
              >
                Sales
              </button>
              <button
                type="button"
                onClick={() => exportStockCsv(products)}
                className="neu-btn neu-btn-sm"
              >
                Stock
              </button>
            </div>
          </Card>

          <Card className="space-y-3">
            <p className="font-display text-base font-bold text-ink">
              Sample shop
            </p>
            <p className="text-sm font-medium leading-relaxed text-ink-muted">
              A demo with three months of bills, some expiring stock and a few
              deliberate mistakes, so you can see what the advisor catches. Your
              shop starts empty — this is only here if you want to look at a
              full one first.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setConfirmDemo(true)}
                className="neu-btn neu-btn-sm"
              >
                Load the sample shop
              </button>
              <button
                type="button"
                onClick={() => setConfirmErase(true)}
                className="neu-btn neu-btn-sm !text-danger"
              >
                <Trash size={15} /> Erase everything
              </button>
            </div>
          </Card>
        </div>
      </section>

      {/* About. */}
      <section className="mt-9">
        <SectionLabel>About</SectionLabel>
        <div className="mt-4">
          <StudioCard />
        </div>

        <Card className="mt-4">
          <div className="flex items-start gap-4">
            <span className="neu-well grid size-11 shrink-0 place-items-center text-brand">
              <Info size={21} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg font-bold text-ink">
                KiranaTrack
              </p>
              <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink-muted">
                Version 1.0 · Runs entirely on this device with no account, no
                server and no tracking. Works with the internet off, which is why
                the advisor does its own analysis rather than depending on a
                hosted one.
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2 border-t border-shadow-dark/20 pt-5 text-sm font-medium leading-relaxed text-ink-muted">
            <Shield size={17} className="mt-0.5 shrink-0 text-success" />
            <span>
              {STUDIO.copyright} Built and maintained as part of{" "}
              <a
                href={STUDIO.links.studio}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-brand hover:underline"
              >
                {STUDIO.name}
              </a>
              .
            </span>
          </div>
        </Card>
      </section>

      <ConfirmDialog
        open={confirmDemo}
        onClose={() => setConfirmDemo(false)}
        onConfirm={() => {
          store.loadDemoData();
          setConfirmDemo(false);
          persist("Sample shop loaded.");
        }}
        title="Load the sample shop"
        body="This replaces everything currently in the app with a demo shop — 30 products, three months of bills and some restocks. Anything you have recorded will be gone. Download a backup first if you want to keep it."
        confirmLabel="Load sample shop"
        destructive
      />

      <ConfirmDialog
        open={confirmErase}
        onClose={() => setConfirmErase(false)}
        onConfirm={() => {
          store.eraseEverything();
          setConfirmErase(false);
          persist("Everything erased.");
        }}
        title="Erase all shop data"
        body="Every product, bill, restock and setting will be permanently deleted from this device. There is no server copy and no way to undo this. If there is anything here you need, download a backup first."
        confirmLabel="Erase everything"
        destructive
      />

      <SiteFooter />
    </>
  );
}
