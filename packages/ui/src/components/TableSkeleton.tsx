import * as React from "react";
import { Skeleton } from "./Skeleton";
import { Table, TableBody, TableCell, TableRow } from "./Table";

export interface TableSkeletonProps {
  /** How many placeholder rows to render. Defaults to 5. */
  rows?: number;
  /** How many columns the real table has, so the placeholder lines up. */
  columns: number;
}

// Drop-in replacement for a plain "טוען..." loading text: shimmering
// placeholder rows shaped like the table that's about to render, so the
// page doesn't visibly jump once the real data arrives.
export function TableSkeleton({ rows = 5, columns }: TableSkeletonProps) {
  return (
    <Table>
      <TableBody>
        {Array.from({ length: rows }).map((_, r) => (
          <TableRow key={r} className="hover:bg-transparent">
            {Array.from({ length: columns }).map((__, c) => (
              <TableCell key={c}>
                <Skeleton className="h-4 w-full max-w-[140px]" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
