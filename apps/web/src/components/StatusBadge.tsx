import { Badge, type BadgeProps } from "@repo/ui";

// Maps a status enum value to a badge color. Kept generic (not per-table)
// since every status enum in the schema shares the same rough shape:
// "new/draft/needed"-ish → secondary, "in progress"-ish → warning,
// "done/accepted/paid/approved"-ish → success, "cancelled/rejected"-ish →
// destructive. Anything unrecognized falls back to outline so a future enum
// value never crashes the UI.
const VARIANT_BY_STATUS: Record<string, NonNullable<BadgeProps["variant"]>> = {
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
