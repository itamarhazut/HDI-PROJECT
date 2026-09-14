import * as React from "react";

// A small hand-built icon set — "rounded duotone" style: a heavier,
// friendlier outline combined with a soft filled accent shape per icon.
// Every icon shares the same viewBox/stroke conventions so they line up
// cleanly wherever they're used (nav items, buttons, empty states).
type IconProps = React.SVGProps<SVGSVGElement>;

const base: React.SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconDashboard(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.25" y="3.25" width="7.5" height="7.5" rx="2.5" fill="currentColor" fillOpacity="0.25" />
      <rect x="13.25" y="3.25" width="7.5" height="7.5" rx="2.5" />
      <rect x="3.25" y="13.25" width="7.5" height="7.5" rx="2.5" />
      <rect x="13.25" y="13.25" width="7.5" height="7.5" rx="2.5" fill="currentColor" fillOpacity="0.25" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="4" fill="currentColor" fillOpacity="0.25" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

export function IconClipboardCheck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2.5" fill="currentColor" fillOpacity="0.15" />
      <path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z" fill="currentColor" fillOpacity="0.4" stroke="none" />
      <path d="m9 13 2 2 4-4" />
    </svg>
  );
}

export function IconBox(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5Z" fill="currentColor" fillOpacity="0.15" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </svg>
  );
}

export function IconTag(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2 22 12 12 22 2 12Z" fill="currentColor" fillOpacity="0.15" />
      <circle cx="9" cy="9" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconFileText(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 3h7l4 4v14H7Z" fill="currentColor" fillOpacity="0.15" />
      <path d="M14 3v4h4" />
      <line x1="9.5" y1="12" x2="14.5" y2="12" />
      <line x1="9.5" y1="15.5" x2="14.5" y2="15.5" />
    </svg>
  );
}

export function IconReceipt(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 2h12v18l-2-1.3L14 20l-2-1.3L10 20l-2-1.3L6 20Z" fill="currentColor" fillOpacity="0.15" />
      <line x1="9" y1="7" x2="15" y2="7" />
      <line x1="9" y1="11" x2="15" y2="11" />
    </svg>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill="currentColor" fillOpacity="0.2" />
    </svg>
  );
}

export function IconMegaphone(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 10v4h3l5 4V6l-5 4H3Z" fill="currentColor" fillOpacity="0.25" />
      <path d="M14 9a4 4 0 0 1 0 6" />
      <path d="M17 6a8 8 0 0 1 0 12" opacity="0.5" />
    </svg>
  );
}

// Generic placeholder for the "חברת חשמל" resource-library section — NOT
// the real Israel Electric Corporation logo (that's a real company's
// trademark; I can't draw or reproduce it myself). Swap this out for the
// real logo once the business owner supplies the actual image file — see
// ResourceLibraryPage.
export function IconBolt(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M13 2 5 13h5l-1 9 8-11h-5l1-9Z" fill="currentColor" fillOpacity="0.25" />
    </svg>
  );
}

// Small "i" info icon — used on the "צ׳ק ליסט בדיקה" checklist card to open
// the reference notes (documents/conditions/sources) in a modal, since the
// card itself no longer shows that text inline.
export function IconInfo(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.12" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" fill="currentColor" fillOpacity="0.2" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Small pencil "edit" icon — used next to each checklist question in
// "בדיקות" so a question's wording can be changed (or deleted) without
// digging through a settings page.
export function IconPencil(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M13.5 5.5 18 10" />
    </svg>
  );
}

// A small "line going up" icon — used on the dashboard's revenue stat card
// and chart, next to IconReceipt (invoices) and IconBox (inventory) as the
// dashboard's own visual language for "money coming in".
export function IconTrendingUp(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <polyline points="15 6 21 6 21 12" fill="currentColor" fillOpacity="0.2" />
      <polyline points="3 17 9 11 13 15 21 6" />
    </svg>
  );
}

// A wallet — the "הוצאות" (business expenses) nav item, deliberately
// distinct from IconReceipt (invoices — money coming in) since this one
// tracks money going out of the business.
export function IconWallet(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill="currentColor" fillOpacity="0.15" />
      <path d="M16 12.5h3v3h-3a1.5 1.5 0 0 1 0-3Z" fill="currentColor" fillOpacity="0.4" />
    </svg>
  );
}

// A small gear — the entry point into /admin/settings, tucked next to the
// user's name at the bottom of the sidebar rather than a full nav item.
export function IconSettings(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.25" />
      <circle cx="12" cy="12" r="3" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <rect
          key={deg}
          x="10.9"
          y="1.9"
          width="2.2"
          height="3"
          rx="1"
          fill="currentColor"
          stroke="none"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
    </svg>
  );
}
