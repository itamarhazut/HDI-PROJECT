import * as React from "react";
import { cn } from "../lib/cn";

// A single shimmering placeholder block. Compose it into whatever shape a
// loading UI needs (a text line, an avatar circle, a card) — see
// `TableSkeleton` for the ready-made list/table case.
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
