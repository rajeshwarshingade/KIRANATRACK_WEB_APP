"use client";

/**
 * Attribution and studio identity.
 *
 * These are the components that credit SmallTown Studio and name Rajeshwar
 * Shingade as the rights holder. They are separated from the store UI because
 * they must read identically in every place they appear — the About screen, the
 * footer under each page, and the printed receipt — and a copyright line
 * retyped per screen is one that drifts.
 *
 * All content comes from `lib/studio.ts`, which mirrors
 * `smalltown-studio/src/data/studio.ts`.
 */

import type { ReactNode } from "react";

import { GitHub, Globe, LinkedIn, Mail, Shield, Sparkle } from "./Icons";
import { DATA_PROMISE, SIBLING_APPS, STUDIO } from "@/lib/studio";

/**
 * Wordmark and attribution line.
 *
 * The "Developed by SmallTown Studio" line sits directly under the app name
 * rather than being relegated to a footer, so it travels with the identity
 * wherever the header is captured or screenshotted.
 */
export function AttributionBar() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs font-medium text-ink-faint">
      <p>
        <span className="font-bold text-ink-muted">{STUDIO.attribution}</span>
        <span aria-hidden="true"> · </span>
        {STUDIO.owner.name}
      </p>
      <p className="flex items-center gap-1.5">
        <Shield size={14} />
        <span>{STUDIO.copyright}</span>
      </p>
    </div>
  );
}

/** Footer shown at the end of every page. */
export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`no-print mt-12 border-t border-shadow-dark/20 pt-8 ${className}`}>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-md">
          <p className="font-display text-base font-bold tracking-wide text-ink">
            {STUDIO.name}
          </p>
          <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink-muted">
            {STUDIO.tagline}
          </p>
          <p className="mt-3 flex items-start gap-2 text-xs font-medium leading-relaxed text-ink-faint">
            <Shield size={15} className="mt-0.5 shrink-0" />
            <span>{DATA_PROMISE}</span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-muted">
            {STUDIO.owner.name}
          </p>
          <FooterLink href={STUDIO.links.studio}>
            <Globe size={15} /> {STUDIO.name}
          </FooterLink>
          <FooterLink href={STUDIO.links.website}>
            <Sparkle size={15} /> rajeshwarshingade.me
          </FooterLink>
          <FooterLink href={STUDIO.links.github}>
            <GitHub size={15} /> GitHub
          </FooterLink>
          <FooterLink href={STUDIO.links.linkedin}>
            <LinkedIn size={15} /> LinkedIn
          </FooterLink>
          <FooterLink href={STUDIO.links.email}>
            <Mail size={15} /> shingade27r@gmail.com
          </FooterLink>
        </div>
      </div>

      <p className="mt-8 border-t border-shadow-dark/20 pt-5 text-xs font-medium text-ink-faint">
        {STUDIO.copyright}
      </p>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-brand"
    >
      {children}
    </a>
  );
}

/**
 * Studio identity panel for the About screen.
 *
 * Gives the full attribution — who built it, who owns it, where to find them —
 * as a first-class block rather than as fine print, because this app ships as a
 * standalone APK and the credit needs to travel with it into a shop.
 */
export function StudioCard() {
  return (
    <section
      aria-labelledby="studio-heading"
      className="neu-raised overflow-hidden p-0"
    >
      <div className="bg-brand px-6 py-6 text-white">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-white/70">
          Developer
        </p>
        <h2
          id="studio-heading"
          className="mt-1.5 font-display text-2xl font-bold tracking-wide"
        >
          {STUDIO.name}
        </h2>
        <p className="mt-1 text-sm font-medium text-white/85">
          {STUDIO.tagline}
        </p>
      </div>

      <div className="px-6 py-6">
        <div className="flex items-start gap-4">
          <span className="neu-well grid size-14 shrink-0 place-items-center font-display text-lg font-bold text-brand">
            {STUDIO.owner.name
              .split(" ")
              .map((part) => part[0])
              .join("")}
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-ink">
              {STUDIO.owner.name}
            </p>
            <p className="text-sm font-medium text-ink-muted">
              {STUDIO.owner.role}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          <StudioLink href={STUDIO.links.studio} label={STUDIO.name} icon={<Globe size={16} />} />
          <StudioLink href={STUDIO.links.website} label="rajeshwarshingade.me" icon={<Sparkle size={16} />} />
          <StudioLink href={STUDIO.links.github} label="Source on GitHub" icon={<GitHub size={16} />} />
          <StudioLink href={STUDIO.links.linkedinCompany} label="Studio on LinkedIn" icon={<LinkedIn size={16} />} />
        </div>

        {SIBLING_APPS.length > 0 && (
          <div className="mt-6 border-t border-shadow-dark/20 pt-5">
            <p className="text-[0.7rem] font-bold uppercase tracking-widest text-ink-muted">
              Also from the studio
            </p>
            {SIBLING_APPS.map((app) => (
              <a
                key={app.name}
                href={app.href}
                target="_blank"
                rel="noopener noreferrer"
                className="neu-inset mt-3 block px-4 py-3 transition-colors hover:text-brand"
              >
                <span className="block font-display text-base font-bold text-ink">
                  {app.name}
                </span>
                <span className="mt-0.5 block text-xs font-medium leading-relaxed text-ink-muted">
                  {app.tagline}
                </span>
              </a>
            ))}
          </div>
        )}

        <p className="mt-6 flex items-start gap-2 border-t border-shadow-dark/20 pt-5 text-xs font-medium leading-relaxed text-ink-muted">
          <Shield size={15} className="mt-0.5 shrink-0 text-success" />
          <span>{DATA_PROMISE}</span>
        </p>

        <p className="mt-4 text-xs font-semibold text-ink-faint">
          {STUDIO.copyright}
        </p>
      </div>
    </section>
  );
}

function StudioLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="neu-btn neu-btn-sm !min-h-0 !justify-start !px-4 !py-3 !text-[0.8rem]"
    >
      <span className="text-brand">{icon}</span>
      <span className="truncate normal-case">{label}</span>
    </a>
  );
}
