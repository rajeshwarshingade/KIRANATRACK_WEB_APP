"use client";

/**
 * Header settings shortcut.
 *
 * A gear rather than a menu, for the reason recorded in `Icons.tsx`: a cog's
 * teeth collapse into a sunburst at 20px and read as a brightness control,
 * whereas two offset rails stay distinct at header size.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Settings } from "./Icons";

export function SettingsButton() {
  const pathname = usePathname();
  const active = pathname.startsWith("/settings");

  return (
    <Link
      href="/settings"
      aria-label="Settings"
      aria-current={active ? "page" : undefined}
      title="Settings"
      className={`neu-btn !min-h-0 !p-3 ${
        active ? "neu-tab-active" : "hover:text-brand"
      }`}
    >
      <Settings size={19} weight="bold" />
    </Link>
  );
}
