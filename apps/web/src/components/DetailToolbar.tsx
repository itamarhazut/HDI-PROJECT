import * as React from "react";

interface DetailToolbarProps {
  children: React.ReactNode;
}

// Pins a detail page's primary actions (back / edit / save / delete, ...)
// to the very top of the screen at all times — position: fixed to the
// viewport, not just sticky within the scroll area — so they stay
// reachable whether you're at the top of the page or scrolled deep into a
// long form. This is the shared version of the toolbar
// ResourceCategoryDetailPage's inspection view first used (see its
// InspectionDetail) — every "compact list → detail page" (customers,
// quotes, invoices, expenses, ...) renders its back link + action buttons
// through this component instead of a loose top link plus a separate
// bottom action row, so the whole app lines up the same way.
//
// `fixed` positioning is relative to the viewport, so it re-derives the
// sidebar/column layout by hand: `start-64` clears the 256px sidebar
// (AppShell's <aside> is w-64) and `end-0` runs to the far edge, then the
// inner `mx-auto max-w-6xl px-6 lg:px-8` matches AppShell's own content
// column so the bar lines up with everything else on the page.
//
// Since `fixed` elements don't reserve layout space, an identical
// invisible copy renders first (same markup, `invisible` so it keeps its
// size but not its pixels) purely to push the real content down by
// exactly the toolbar's real height — including if it wraps to two lines
// on a narrow phone screen.
//
// Pass exactly two children: a back link/button, then a
// `<div className="flex flex-wrap items-center justify-end gap-2">` of
// action buttons — matching the `justify-between` layout below. The
// `flex-wrap` on that inner div matters on its own, separately from the
// `flex-wrap` on the outer bar: a page with enough buttons (quotes,
// invoices, ...) could still overflow past the *end* of a narrow window
// (e.g. two apps snapped side by side) even after the outer bar already
// wrapped the button group onto its own line under the back link — the
// button group needs to be able to wrap onto a second line by itself too,
// rather than overflowing the container width.
//
// A `ScaleToFit` component (CSS `zoom`-based shrinking, no wrap) was tried
// here instead, per an earlier request to avoid a second line entirely —
// reverted, didn't look good in practice (see ScaleToFit.tsx, still in the
// codebase but currently unused by anything). Wrapping onto a second line
// is the current, working behavior.
export function DetailToolbar({ children }: DetailToolbarProps) {
  const bar = (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 shadow-md">
      {children}
    </div>
  );

  return (
    <>
      <div className="invisible" aria-hidden="true">
        {bar}
      </div>
      <div className="fixed start-64 end-0 top-0 z-20">
        <div className="mx-auto max-w-6xl px-6 py-3 lg:px-8">{bar}</div>
      </div>
    </>
  );
}
