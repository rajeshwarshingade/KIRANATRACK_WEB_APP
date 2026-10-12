# KiranaTrack

A store operating system for Indian kirana shops — GST billing, stock control,
expiry tracking, and a business advisor that reads your own numbers and tells you
what to do next.

Runs entirely on the device. No account, no server, no telemetry.

**Developed by [SmallTown Studio](https://small-town-studio.vercel.app) —
all rights and ownership go to Rajeshwar Shingade.**

---

## What it does

| Screen | What it is for |
| --- | --- |
| **Dashboard** | Today's takings, what is expiring, what is running low, and the two things most worth doing. |
| **Billing** | POS-style bill entry with live GST and rounding. Search-to-tap in one hand. |
| **Bills** | The register and the day book. Reconcile a day by payment mode; reprint any receipt. |
| **Restock** | Record a supplier delivery. Adds quantity, refreshes cost price and received date. |
| **Stock** | Catalogue and expiry ledger together, with reorder points and margin per line. |
| **Insights** | Trend, category, margin and expiry charts — then the full advisor. |
| **Activity** | Every change to stock or a bill, with the money attached to each. |
| **Settings** | Shop identity, alert thresholds, optional AI, backup/restore, erase. |

### The advisor

The part worth explaining. It is not a chatbot — it is a deterministic analyst
that runs on the device with no network and no key, so it works on a shop
counter connection.

It reads your sales velocity, margins, stock age and expiry dates, and emits
ranked findings that each:

- **name the money** — "₹2,230 of stock expires within 7 days", not "check your
  expiry dates";
- **are falsifiable** — confidence reflects how much sales history backs the
  claim, so a suggestion from two weeks of data is flagged below one from a
  quarter;
- **can be applied in one tap** — actions are typed operations with real
  arithmetic (`AdvisorAction`), not strings the UI has to parse;
- **respect the economics** — a suggested markdown is capped by each item's own
  margin, so it can never recommend a cut that sells below cost.

An optional hosted LLM can write those findings up as a morning briefing. It is
off by default, and nothing above depends on it.

### GST

Correct Indian retail GST, computed per tax rate across the whole bill:

- an **in-state** sale splits the tax evenly into CGST and SGST at half the rate;
- an **inter-state** sale carries a single IGST line at the full rate, chosen by
  comparing the customer's place of supply against the shop's own state code;
- mixed-rate bills (5% packaged food with 18% soap) accumulate tax per rate, so
  the CGST and SGST lines sum back to the declared rate exactly;
- the bill rounds to whole rupees and records the `roundOff`, so the printed
  total always equals the sum of its printed lines.

All money is integer paise. There are no floats anywhere in a stored amount.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build
npm run lint
```

First run seeds a demo shop — 27 products, three months of bills with weekday
and festival structure, three supplier deliveries, and a handful of deliberate
problems (an expired batch, an item priced below cost, a dead line, a fast seller
at zero) so the advisor has something true to report. Clear it in one tap from
Settings.

### Android APK

The signed release build is committed to the studio repo at
`public/apps/KiranaTrack.apk`, served from
`small-town-studio.vercel.app/apps/KiranaTrack.apk`. It is requested through a
short form rather than linked directly, so it can be handed over with a reply.

To rebuild it:

```bash
CAPACITOR_BUILD=1 npm run build   # static export to out/
npx cap sync android
cd android && gradlew.bat assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk
```

`CAPACITOR_BUILD=1` switches `next.config.ts` to `output: "export"` with
directory-style URLs. Without it the web build is untouched — the web deployment
is a normal server build and must not inherit the WebView's constraints.

**Signing.** Release signing reads from `android/keystore.properties`, which is
git-ignored along with the `.jks`. `build.gradle` falls back to an unsigned
release when that file is absent, so a fresh clone still builds.

```bash
keytool -genkeypair -v -keystore android-keystore/kiranatrack-release.jks \
  -alias kiranatrack -keyalg RSA -keysize 2048 -validity 10950
```

That keystore is what lets you ship an update to an installed app — Android
refuses an update signed by a different key — so back it up alongside the shop's
own data backups. Losing it means the next build has to ship under a new
package identity.

---

## How it is put together

```
src/
  app/            routes — one folder per screen
    globals.css   the design system
  components/     UI primitives, charts, advisor, nav, attribution
  lib/
    types.ts      the domain model
    money.ts      paise arithmetic and GST
    dates.ts      timezone-safe date-only handling
    analytics.ts  derived figures — every screen reads from here
    advisor.ts    the rules engine
    ai.ts         optional LLM bridge
    store.ts      pure mutations (no React)
    store-context.tsx  wires mutations to React
    storage.ts    useSyncExternalStore over localStorage
    schema.ts     storage versioning and migrations
    seed.ts       the demo shop
    backup.ts     JSON backup, CSV exports, receipt printing
    studio.ts     attribution — studio, owner, links, rights
```

A few decisions worth knowing about before changing things:

**Money is never a float.** Everything is whole paise. `0.1 + 0.2` problems in a
GST invoice are not cosmetic — they produce a total that does not reconcile
against the tax the shop owes.

**Dates are `YYYY-MM-DD` strings, never `Date`.** A `Date` is an instant;
"expires on 14 March" is a whole day. The same string becomes a different day
depending on the reader's timezone, which for a date printed on a food packet
is unacceptable. Helpers work on the string components and never construct a
local `Date` from a date-only string.

**`costAtSale` is copied onto every sale line.** Repricing an item must not
retroactively change the profit on a bill that has already been issued.

**Stock only moves through `lib/store.ts`.** A sale decrements it, a restock
increments it, a write-off removes it — each writing an audit entry. No component
may mutate `qty`, so the dashboard and the expiry list cannot disagree about how
much stock exists.

**Storage is `useSyncExternalStore`, not effect + `setState`.** localStorage is an
external store; it changes outside React and must not be read during render.
`getServerSnapshot` gives SSR and hydration the default, `getSnapshot` gives the
real value afterwards.

**An update must never cost a shop its ledger.** Every stored document carries a
schema version and is passed through a migration chain on read.

---

## Accessibility

Neumorphism is a high-contrast risk — soft light-on-light fights WCAG AA. The
design system keeps the full surface language (dual convex/concave shadows, no
hard borders, press-to-sink states) while enforcing measured contrast on every
text token. Against the `#e3e9f2` base:

| Token | Value | Ratio |
| --- | --- | --- |
| `--color-ink` | `#1E293B` | 11.6:1 (AAA) |
| `--color-ink-muted` | `#475569` | 6.3:1 (AA body) |
| `--color-ink-faint` | `#64748B` | 4.6:1 (AA large only) |
| `--color-brand` | `#1E40AF` | 9.9:1 (white on it) |
| `--color-accent` | `#C2410C` | 5.4:1 (white on it) |

Also: every focusable element gets an explicit high-contrast ring (the default
outline is invisible on a soft surface), primary touch targets are 48px, colour
never carries meaning alone, modals trap focus and restore it on close, and
`prefers-reduced-motion` collapses durations rather than removing feedback.

---

## Data

Everything is local. Two consequences the app is explicit about:

1. **Take a backup.** It is the only copy. Settings → *Download a full backup*
   writes one JSON file containing products, bills, purchases and settings. Your
   API key is stripped from it.
2. **Restoring refuses a newer backup** rather than silently dropping fields this
   build does not understand.

CSVs are exports, not backups — for Excel, Tally and GST reconciliation.

---

## Links

- **Live web app** — <https://kiranatrack-web-app.vercel.app>
- Studio — <https://small-town-studio.vercel.app>
- App page — <https://small-town-studio.vercel.app/apps/kiranatrack>
- Rajeshwar Shingade — <https://rajeshwarshingade.me>
- Source — <https://github.com/rajeshwarshingade/KIRANATRACK_WEB_APP>
- GitHub — <https://github.com/rajeshwarshingade>
- LinkedIn — <https://www.linkedin.com/in/rajeshwarshingade>
- WhatsApp — <https://wa.me/917387296585> (+91 73872 96585)
- Email — <shingade27r@gmail.com>

© SmallTown Studio — all rights and ownership go to Rajeshwar Shingade.
