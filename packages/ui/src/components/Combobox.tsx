import * as React from "react";
import { cn } from "../lib/cn";
import { Input } from "./Input";

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface ComboboxProps {
  id?: string;
  options: ComboboxOption[];
  /** Currently selected value, or "" for none. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Label for a leading "no selection" row, e.g. "ללא". Omit to require a selection. */
  emptyOptionLabel?: string;
  /** Trailing action row, e.g. "+ לקוח חדש". */
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

// A styled, searchable dropdown — replaces a plain native <select> for
// pickers where the list can get long (customers, jobs, price-list items)
// and where a native browser popup looks out of place next to the rest of
// the app's design. Type to filter, click a row to select.
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder,
  emptyOptionLabel,
  actionLabel,
  onAction,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <Input
        id={id}
        value={open ? query : selected?.label ?? ""}
        placeholder={selected ? undefined : placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-card py-1 text-card-foreground shadow-sm">
          {emptyOptionLabel && (
            <button
              type="button"
              className="flex w-full items-center px-3 py-2 text-start text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onChange("");
                setOpen(false);
                setQuery("");
              }}
            >
              {emptyOptionLabel}
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">אין תוצאות</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className={cn(
                  "flex w-full flex-col items-start px-3 py-2 text-start text-sm hover:bg-accent hover:text-accent-foreground",
                  o.value === value && "bg-accent/60"
                )}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span>{o.label}</span>
                {o.sublabel && <span className="text-xs text-muted-foreground">{o.sublabel}</span>}
              </button>
            ))
          )}
          {onAction && actionLabel && (
            <button
              type="button"
              className="flex w-full items-center gap-1 border-t border-border px-3 py-2 text-start text-sm font-medium text-primary hover:bg-accent"
              onClick={() => {
                setOpen(false);
                setQuery("");
                onAction();
              }}
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
