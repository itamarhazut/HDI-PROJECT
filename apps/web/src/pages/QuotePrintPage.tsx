import { useParams, Link } from "react-router-dom";
import { Button } from "@repo/ui";
import { QuoteDocumentView } from "../components/QuoteDocumentView";
import { useQuoteDocumentData } from "../hooks/useQuoteDocumentData";

// Shared print/PDF view for a single quote, reachable from both the admin
// panel (/admin/quotes/:id/print) and the customer portal
// (/portal/quotes/:id/print). It renders outside AppShell (no sidebar),
// so it's just the document itself — the browser's own "Print → Save as
// PDF" produces a clean, correctly RTL Hebrew PDF with zero extra
// dependencies or Hebrew-font embedding headaches. Kept as a dedicated,
// unstyled route (rather than printing from inside a modal over the app
// shell) because that's the reliable way to get a clean printed page —
// the in-page "view" modal (QuoteViewModal) still links here for the
// actual print/PDF step.
export function QuotePrintPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuoteDocumentData(id);

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">טוען...</div>;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-3 p-8">
        <p className="text-destructive">לא ניתן לטעון את הצעת המחיר (ייתכן שאין לך הרשאה לצפות בה, או שהיא נמחקה).</p>
        <Link to="/" className="text-primary underline">
          חזרה
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between px-8 print:hidden">
        <Link to=".." relative="path" className="text-sm text-primary underline">
          ← חזרה
        </Link>
        <Button onClick={() => window.print()}>הדפסה / שמירה כ-PDF</Button>
      </div>
      <QuoteDocumentView data={data} />
    </div>
  );
}
