import * as React from "react";
import { Button } from "./Button";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmDialogContext = React.createContext<ConfirmFn | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

// Replaces the browser's native confirm() with a styled modal that matches
// the rest of the app. Usage is imperative and promise-based on purpose —
// `const ok = await confirmDialog({ title, description, variant })` — so it
// drops into an existing `if (confirm(...)) doThing()` call site with a
// minimal, mechanical change (add `await`, drop in the options object).
export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);

  const confirmDialog = React.useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmDialogContext.Provider value={confirmDialog}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => close(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-lg border bg-card p-6 text-card-foreground shadow-sm"
          >
            <h2 className="text-lg font-semibold">{pending.title}</h2>
            {pending.description && <p className="mt-2 text-sm text-muted-foreground">{pending.description}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => close(false)}>
                {pending.cancelLabel ?? "ביטול"}
              </Button>
              <Button variant={pending.variant === "destructive" ? "destructive" : "default"} onClick={() => close(true)}>
                {pending.confirmLabel ?? "אישור"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog(): ConfirmFn {
  const ctx = React.useContext(ConfirmDialogContext);
  if (!ctx) throw new Error("useConfirmDialog must be used within a ConfirmDialogProvider");
  return ctx;
}
