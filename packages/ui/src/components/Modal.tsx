import * as React from "react";
import { cn } from "../lib/cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Tailwind max-width class for the modal card. Defaults to "max-w-lg". */
  maxWidthClassName?: string;
  footer?: React.ReactNode;
}

// A small, dependency-free modal — a dark overlay plus a centered card.
// Used for anything that needs to interrupt the page briefly without a
// full navigation: quick-add forms, previews, document viewers.
export function Modal({ open, onClose, title, children, maxWidthClassName = "max-w-lg", footer }: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm",
          maxWidthClassName
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border p-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-auto p-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">{footer}</div>}
      </div>
    </div>
  );
}
