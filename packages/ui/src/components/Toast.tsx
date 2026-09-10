import * as React from "react";
import { cn } from "../lib/cn";

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
}

type ToastFn = (options: ToastOptions) => void;

const ToastContext = React.createContext<ToastFn | null>(null);

const VARIANT_STYLES: Record<ToastVariant, { badge: string; icon: React.ReactNode }> = {
  success: {
    badge: "bg-emerald-500",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 13 4 4L19 7" />
      </svg>
    ),
  },
  error: {
    badge: "bg-destructive",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    ),
  },
  info: {
    badge: "bg-primary",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8v5" />
        <path d="M12 16.5h.01" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
};

// A minimal, dependency-free toast system: `ToastProvider` renders the
// stacked notification list once at the app root, and any component calls
// `useToast()` to push a message onto it. No portal library needed — the
// list is just a `fixed` div rendered alongside `children`.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = React.useCallback<ToastFn>(
    (options) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((current) => [...current, { variant: "info", ...options, id }]);
      window.setTimeout(() => dismiss(id), options.durationMs ?? 4000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:end-4 sm:items-end">
        {toasts.map((t) => {
          const style = VARIANT_STYLES[t.variant ?? "info"];
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-sm sm:w-96"
            >
              <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white", style.badge)}>
                {style.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label="סגירה"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
