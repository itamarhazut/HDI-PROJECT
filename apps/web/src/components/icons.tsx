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

export function IconLogout(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" fill="currentColor" fillOpacity="0.2" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
