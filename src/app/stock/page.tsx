/**
 * Stock page shell.
 *
 * A server component whose only job is to provide the `<Suspense>` boundary
 * that `useSearchParams` requires. The screen itself is client-side, because
 * stock, expiry and quantity all read from localStorage.
 *
 * The fallback mirrors the real screen's shape — stat row, then a panel — so
 * the transition into the loaded page does not reflow.
 */

import { Suspense } from "react";

import { PageSkeleton } from "@/components/ui";

import StockView from "./StockView";

export default function StockPage() {
  return (
    <Suspense fallback={<PageSkeleton stats={3} />}>
      <StockView />
    </Suspense>
  );
}
