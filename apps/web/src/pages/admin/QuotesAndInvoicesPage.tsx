import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { strings } from "@repo/shared";
import { QuotesPage } from "./QuotesPage";
import { InvoicesPage } from "./InvoicesPage";

type TabKey = "quotes" | "invoices";

// One sidebar entry for both — issuing an invoice is really the next step
// after a quote's job is done, not a separate destination, so quotes and
// invoices now live under a single nav item with two tabs instead of two
// nav items. Each tab renders the existing list page completely unchanged
// (its own header, "+ new" button, search box and all), so this wrapper's
// only job is picking which one shows and keeping that choice in the URL
// (?tab=invoices) so links/back-navigation land on the right tab.
export function QuotesAndInvoicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabKey = searchParams.get("tab") === "invoices" ? "invoices" : "quotes";

  const setTab = (next: TabKey) => {
    setSearchParams(next === "quotes" ? {} : { tab: next }, { replace: true });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-4 border-b border-border">
        <TabButton active={tab === "quotes"} onClick={() => setTab("quotes")}>
          {strings.nav.quotes}
        </TabButton>
        <TabButton active={tab === "invoices"} onClick={() => setTab("invoices")}>
          {strings.nav.invoices}
        </TabButton>
      </div>

      {tab === "quotes" ? <QuotesPage /> : <InvoicesPage />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "-mb-px border-b-2 border-primary px-1 pb-2 text-sm font-medium text-foreground"
          : "-mb-px border-b-2 border-transparent px-1 pb-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}
