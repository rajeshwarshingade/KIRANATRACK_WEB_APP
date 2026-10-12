/**
 * Studio identity and attribution.
 *
 * One file so the attribution line reads identically everywhere it appears —
 * the About screen, the footer under every page, the app header caption and the
 * README. Attribution that is retyped per screen drifts within a release, and
 * a drifted copyright line is the kind of thing that quietly weakens a
 * trademark.
 *
 * Mirrors `smalltown-studio/src/data/studio.ts` rather than re-deriving the
 * links, so the studio site and the app never disagree about who owns what.
 */

/** Who built this, and where to find them. */
export const STUDIO = {
  name: "SmallTown Studio",
  /** Used under the app name in the header and on the About screen. */
  attribution: "Developed by SmallTown Studio",
  tagline: "Custom apps, built carefully and supported for as long as you need.",

  /**
   * The owner.
   *
   * Named explicitly rather than as "the developer" because the rights line
   * below has to name a person, and the person who holds the rights should be
   * the person the UI credits.
   */
  owner: {
    name: "Rajeshwar Shingade",
    role: "Data Analyst & App Developer",
  },

  links: {
    /** The studio's own site — the business's public presence. */
    studio: "https://small-town-studio.vercel.app",
    /** The founder's portfolio. */
    website: "https://rajeshwarshingade.me",
    github: "https://github.com/rajeshwarshingade",
    /** The studio's company page, for clients following the work. */
    linkedinCompany: "https://www.linkedin.com/company/smalltownstudio",
    /** The founder personally, behind the "one person" claim. */
    linkedin: "https://www.linkedin.com/in/rajeshwarshingade",
    email: "mailto:shingade27r@gmail.com",
    /** Where this app's source lives. */
    source: "https://github.com/rajeshwarshingade/KIRANATRACK_WEB_APP",
  },

  /**
   * The rights line.
   *
   * "All rights and ownership go to Rajeshwar Shingade" rather than a
   * © SmallTown Studio, because the studio is a one-person trading name and
   * the individual is the actual rights holder. Spelling it that way keeps the
   * attribution accurate regardless of how the business is later registered.
   */
  copyright:
    "SmallTown Studio — all rights and ownership go to Rajeshwar Shingade.",
} as const;

/** The other apps from the same studio, linked from the About screen. */
export const SIBLING_APPS = [
  {
    name: "StudyFlow",
    tagline: "A focus timer with a weekly timetable and an honest study record.",
    href: STUDIO.links.studio,
  },
] as const;

/** Where the store data lives, said plainly for an owner deciding to trust it. */
export const DATA_PROMISE =
  "Everything you record stays on this device. No account, no server, no " +
  "telemetry. Uninstalling the app is the only way your data can leave it.";
