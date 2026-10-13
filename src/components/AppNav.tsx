"use client";

/**
 * Primary navigation.
 *
 * Seven destinations, which is past what a bottom dock can carry legibly — a
 * fifth label drops below the width a 10px label needs on a 375px phone. So the
 * rail is used on wide screens where all seven fit comfortably, and the dock
 * carries the four an owner opens daily, with the rest reachable from the
 * in-page "More" section headers and the header menu on small screens.
 *
 * Billing is deliberately absent from the dock and lives on the dashboard as a
 * large primary action instead: a shop owner rings up a sale from wherever they
 * happen to be, and the billing screen is reached in one tap from the screen
 * they are already on.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Box,
  Cart,
  ChartLine,
  History,
  Home,
  Receipt,
  Truck,
} from "./Icons";
import { STUDIO_NAME, OWNER_NAME } from "./Attribution";
import { APP_VERSION } from "@/lib/app-info";

/** Everything reachable. The rail renders all of it. */
const ALL_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Stock", href: "/stock", icon: Box },
  { label: "Billing", href: "/billing", icon: Cart },
  { label: "Bills", href: "/bills", icon: Receipt },
  { label: "Restock", href: "/restock", icon: Truck },
  { label: "Insights", href: "/insights", icon: ChartLine },
  { label: "Activity", href: "/activity", icon: History },
] as const;

/** The four the mobile dock carries. */
const DOCK_ITEMS = ALL_ITEMS.filter((item) =>
  ["/", "/stock", "/bills", "/insights"].includes(item.href),
);

export function AppNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Desktop rail */}
      <nav aria-label="Main" className="sticky top-6 hidden self-start lg:block">
        <ul className="neu-dock flex flex-col gap-1.5 p-2.5">
          {ALL_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`neu-tab-label flex-row gap-3 !py-3 transition-colors duration-200 ${
                    active ? "neu-tab-active" : "neu-tab-idle hover:text-ink"
                  }`}
                >
                  <Icon size={21} weight="bold" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile dock — fixed, translucent, always at the bottom. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 px-3 lg:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <ul className="neu-dock flex items-stretch gap-1 p-2">
          {DOCK_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`neu-tab-label transition-all duration-200 ${
                    active ? "neu-tab-active" : "neu-tab-idle"
                  }`}
                >
                  <Icon size={21} weight="bold" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/**
 * Wordmark used by the fixed top bar.
 *
 * Carries the app name, the studio credit and the build version. The version
 * is here rather than only in Settings because this is the one line visible on
 * every screen — when someone reports a bug, the first question is always
 * which version, and it should not need a trip through Settings to answer.
 *
 * The credit is part of the mark rather than a separate header element: this
 * app ships as a standalone APK with no store page attached, so the attribution
 * has to travel with the identity onto the home screen.
 */
export function AppMark() {
  return (
    <Link href="/" className="flex items-center gap-3 rounded-xl">
      <span className="neu-well grid size-11 shrink-0 place-items-center text-brand">
        <Receipt size={22} />
      </span>
      <span className="leading-tight">
        <span className="block font-display text-xl font-bold tracking-wide text-ink">
          KiranaTrack
          <span className="ml-1.5 align-middle font-sans text-[0.7rem] font-bold tracking-wide text-ink-faint">
            v{APP_VERSION}
          </span>
        </span>
        <span className="block text-[0.68rem] font-medium tracking-wide text-ink-faint">
          {STUDIO_NAME} · {OWNER_NAME}
        </span>
      </span>
    </Link>
  );
}
