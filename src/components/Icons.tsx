/**
 * Inline SVG icon set.
 *
 * The design rules require one consistent icon family with a uniform stroke
 * width, and forbid emoji as structural icons. These share a 24px grid and a
 * 1.75 stroke so they stay legible at every size used in the app.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  /**
   * Stroke thickness. Nav icons pass "bold" (2.25) because at 20px in a tab bar
   * a 1.75 stroke reads thin and washed out; icons sitting beside body text stay
   * at 1.75 so they do not overpower the label.
   */
  weight?: "regular" | "bold";
};

function Icon({
  size = 24,
  weight = "regular",
  children,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight === "bold" ? 2.25 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function Home(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z" />
      <path d="M9.5 20.5v-6h5v6" />
    </Icon>
  );
}

/** Box with a lid — stock on a shelf. */
export function Box(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.5 8.5v7a1.5 1.5 0 0 1-.8 1.32l-7 3.7a1.5 1.5 0 0 1-1.4 0l-7-3.7A1.5 1.5 0 0 1 3.5 15.5v-7" />
      <path d="m3.7 7.6 7.55-3.98a1.5 1.5 0 0 1 1.4 0L20.3 7.6a.55.55 0 0 1 0 1l-7.55 3.97a1.5 1.5 0 0 1-1.4 0L3.7 8.6a.55.55 0 0 1 0-1Z" />
      <path d="M12 12.4v9" />
    </Icon>
  );
}

/** Receipt with a zigzag bottom edge — a bill. */
export function Receipt(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 3.5h14v17l-2.3-1.6-2.35 1.6-2.35-1.6L9.65 20.5 7.3 18.9 5 20.5v-17Z" />
      <path d="M8.5 8h7M8.5 12h7" />
    </Icon>
  );
}

/** Coin and note stack — restocking. */
export function Truck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 6.5h10.2v10H2.5z" />
      <path d="M12.7 10h3.9l2.9 3v3.5h-6.8" />
      <circle cx="7" cy="18" r="1.9" />
      <circle cx="16.8" cy="18" r="1.9" />
    </Icon>
  );
}

export function ChartLine(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 3.5v17h17" />
      <path d="m7 15 3.5-4 3 2.5L20 7" />
    </Icon>
  );
}

export function ChartBar(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Icon>
  );
}

export function User(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </Icon>
  );
}

export function Settings(props: IconProps) {
  return (
    <Icon {...props}>
      {/*
        Sliders rather than a cog. A cog's teeth collapse into a sunburst
        silhouette at 20px — it reads as a brightness control — whereas two
        offset rails with knobs stay distinct at header size.
      */}
      <path d="M3.5 7.5h8.5M16.5 7.5h4M3.5 16.5h4M12 16.5h8.5" />
      <circle cx="14.25" cy="7.5" r="2.5" />
      <circle cx="9.75" cy="16.5" r="2.5" />
    </Icon>
  );
}

export function Search(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </Icon>
  );
}

export function Plus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function Minus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
    </Icon>
  );
}

export function Trash(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 6.5h15M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
      <path d="M10.5 10v6.5M13.5 10v6.5" />
    </Icon>
  );
}

export function Pencil(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 19.5h3.2l9-9a2.26 2.26 0 0 0-3.2-3.2l-9 9v3.2Z" />
      <path d="M12.5 6.5 15.5 9.5" />
    </Icon>
  );
}

export function Check(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function CheckCircle(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </Icon>
  );
}

/** Crossed circle — expired. */
export function AlertTriangle(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.5 2.8 19.5h18.4L12 4.5Z" />
      <path d="M12 10v4.2M12 17.2v.01" />
    </Icon>
  );
}

export function Clock(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

/** Rupee sign — money, used wherever a figure needs a unit. */
export function Rupee(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.5 4.5h9M7.5 9h9M16 4.5c0 3.5-2.2 4.5-4.5 4.5H7.5l7.5 10.5" />
    </Icon>
  );
}

export function Sparkle(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.7 10.4 12.2 5 10.6 10.4 9 12 3.5Z" />
      <path d="M18.5 16.5 19 18.4l1.9.5-1.9.5-.5 1.9-.5-1.9-1.9-.5 1.9-.5.5-1.9Z" />
    </Icon>
  );
}

export function Cart(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 3.5h2.2l2.1 10.4a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.47-1.15L20 6.8H6" />
      <circle cx="9.5" cy="19" r="1.6" />
      <circle cx="17" cy="19" r="1.6" />
    </Icon>
  );
}

export function Download(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5v11M8 11l4 4 4-4" />
      <path d="M4.5 17.5v1.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
    </Icon>
  );
}

export function Upload(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20.5v-11M8 13l4-4 4 4" />
      <path d="M4.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h12A1.5 1.5 0 0 1 19.5 5v1.5" />
    </Icon>
  );
}

export function Print(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 9V3.5h10V9" />
      <path d="M7 18H5.5A1.5 1.5 0 0 1 4 16.5v-5A1.5 1.5 0 0 1 5.5 10h13a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17" />
      <path d="M7 14.5h10v6H7z" />
    </Icon>
  );
}

export function Bell(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
      <path d="M13.75 19a2 2 0 0 1-3.5 0" />
    </Icon>
  );
}

export function History(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5V10H9" />
      <path d="M12 7.5V12l3 1.8" />
    </Icon>
  );
}

export function Close(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function Inbox(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 13.5h4l1.5 3h6l1.5-3h4" />
      <path d="M5.6 4.8 3.5 13.5v4A2 2 0 0 0 5.5 19.5h13a2 2 0 0 0 2-2v-4l-2.1-8.7a2 2 0 0 0-1.9-1.5H7.5a2 2 0 0 0-1.9 1.5Z" />
    </Icon>
  );
}

export function TrendingUp(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3.5 16.5 5.5-5.5 3.5 3.5 6-6.5" />
      <path d="M14.5 8h4v4" />
    </Icon>
  );
}

export function TrendingDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3.5 7.5 5.5 5.5 3.5-3.5 6 6.5" />
      <path d="M14.5 16h4v-4" />
    </Icon>
  );
}

export function Globe(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.2 2.4 3.3 5.4 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.4-3.3-8.5S9.8 5.9 12 3.5Z" />
    </Icon>
  );
}

export function Mail(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="m3 7 8.1 5.6a1.6 1.6 0 0 0 1.8 0L21 7" />
    </Icon>
  );
}

export function GitHub(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.5 20.5c-4.5 1.4-4.5-2.3-6-2.8m12 5.3v-3.6a3.1 3.1 0 0 0-.9-2.4c2.9-.3 6-1.4 6-6.4a5 5 0 0 0-1.4-3.5 4.6 4.6 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.3 12.3 0 0 0-6.5 0C6.6 3.6 5.5 3.9 5.5 3.9a4.6 4.6 0 0 0-.1 3.5A5 5 0 0 0 4 10.9c0 5 3 6.1 5.9 6.4a3.1 3.1 0 0 0-.9 2.4v3.6" />
    </Icon>
  );
}

export function LinkedIn(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 10.5v6M8 7.6v.01M12 16.5v-3.4a2.1 2.1 0 0 1 4.2 0v3.4" />
    </Icon>
  );
}

export function Shield(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 5 6.2v5.4c0 4.2 2.9 7.6 7 8.9 4.1-1.3 7-4.7 7-8.9V6.2L12 3.5Z" />
      <path d="m9.2 12 2 2 3.6-4" />
    </Icon>
  );
}

export function Info(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.2M12 7.8v.01" />
    </Icon>
  );
}
