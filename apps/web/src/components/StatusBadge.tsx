import { Badge, type BadgeProps } from "@repo/ui";

// Maps a status enum value to a badge color. Kept generic (not per-table)
// since every status enum in the schema shares the same rough shape:
// "new/draft/needed"-ish → secondary, "in progress"-ish → warning,
// "done/accepted/paid/approved"-ish → success, "cancelled/rejected"-ish →
// destructive. Anything unrecognized falls back to outline so a future enum
// value never crashes the UI.
export const VARIANT_BY_STATUS: Record<string, NonNullable<BadgeProps["variant"]>> = {
  new: "secondary",
  draft: "secondary",
  needed: "secondary",
  idea: "secondary",
  contacted: "warning",
  scheduled: "warning",
  sent: "warning",
  in_progress: "warning",
  submitted: "warning",
  pending: "warning",
  marked_invoiced: "warning",
  completed: "success",
  accepted: "success",
  approved: "success",
  paid: "success",
  converted: "success",
  published: "success",
  cancelled: "destructive",
  rejected: "destructive",
  expired: "destructive",
  overdue: "destructive",
  lost: "destructive",
};

interface StatusBadgeProps {
  status: string;
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return <Badge variant={VARIANT_BY_STATUS[status] ?? "outline"}>{label}</Badge>;
}

// Same color mapping as the badge above, but as raw background/text
// classes instead of a wrapped <Badge> — for places that need the color
// on something else, like StatusSelect's pill-styled <select>.
const COLOR_CLASSNAME_BY_VARIANT: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "bg-muted text-foreground",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  destructive: "bg-red-100 text-red-800",
};

export function statusColorClassName(status: string): string {
  return COLOR_CLASSNAME_BY_VARIANT[VARIANT_BY_STATUS[status] ?? "outline"];
}

// A small solid dot version of the same color, for places that show the
// status color as an accent next to plain text/controls instead of as a
// filled pill — see StatusSelect.
const DOT_CLASSNAME_BY_VARIANT: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-primary",
  secondary: "bg-secondary-foreground/40",
  outline: "bg-muted-foreground/40",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  destructive: "bg-red-500",
};

export function statusDotClassName(status: string): string {
  return DOT_CLASSNAME_BY_VARIANT[VARIANT_BY_STATUS[status] ?? "outline"];
}
