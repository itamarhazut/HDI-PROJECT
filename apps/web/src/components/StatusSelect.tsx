import * as React from "react";
import { cn } from "@repo/ui";
import { statusDotClassName } from "./StatusBadge";

interface StatusSelectProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Show the small colored dot next to each option (and the closed
   *  button). Defaults to true for actual status enums, where the color is
   *  meaningful; pass false for a plain filter/picker where the values
   *  aren't a status at all (e.g. "all"/"pending", a report period) and a
   *  color dot would just be noise. */
  showDot?: boolean;
  className?: string;
  /** id on the closed button — e.g. to pair with a <Label htmlFor>. */
  id?: string;
  "aria-label"?: string;
}

// A quick, one-click status changer that sits in a toolbar full of plain
// outline buttons (עריכה, צפייה / PDF...) — closed, it's sized and
// bordered exactly like those buttons so it reads as "one more button in
// the row". The dropdown itself is a custom-styled panel (same look as
// Combobox's) instead of the browser's own native <select> popup, which
// can't be restyled and looked out of place next to the rest of the app.
//
// Despite the name, this is also the standard replacement for a plain
// filter/enum <select> anywhere in the app — a toolbar filter (status,
// report period, "all" vs "pending only"...) wires value/onChange directly;
// a react-hook-form field wraps it in a <Controller> (see QuotesPage's
// discount_type, or QuoteDetailPage's status selector, for the pattern).
// Set showDot={false} whenever the values aren't a real status (an enum
// picker, a unit, a period) and a color dot would just be noise. A
// picker over a long/searchable list of records (customer, job, quote,
// inventory item) uses Combobox instead — see the same files' customer_id.
export function StatusSelect<T extends string>({
  value,
  options,
  onChange,
  disabled,
  showDot = true,
  className,
  ...rest
}: StatusSelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        {...rest}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 items-center justify-between gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50",
          className
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {showDot && (
            <span className={cn("h-2 w-2 shrink-0 rounded-full", statusDotClassName(value))} aria-hidden="true" />
          )}
          <span className="truncate">{current?.label ?? value}</span>
        </span>
        <svg className="h-3 w-3 shrink-0 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 min-w-full overflow-hidden whitespace-nowrap rounded-md border bg-card py-1 text-card-foreground shadow-sm">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn(
                "flex w-full items-center gap-1.5 px-3 py-2 text-start text-sm hover:bg-accent hover:text-accent-foreground",
                opt.value === value && "bg-accent/60 font-medium"
              )}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {showDot && (
                <span className={cn("h-2 w-2 shrink-0 rounded-full", statusDotClassName(opt.value))} aria-hidden="true" />
              )}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
