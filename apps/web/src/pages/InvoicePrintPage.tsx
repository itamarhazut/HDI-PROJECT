import { useParams, Link } from "react-router-dom";
import { Button } from "@repo/ui";
import { InvoiceDocumentView } from "../components/InvoiceDocumentView";
import { useInvoiceDocumentData } from "../hooks/useInvoiceDocumentData";

// Mirrors QuotePrintPage exactly — a dedicated, unstyled print/PDF route
// (no sidebar), reachable at /admin/invoices/:id/print. The in-page "view"
// modal (InvoiceViewModal) links here for the actual print/PDF step.
export function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useInvoiceDocumentData(id);

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">טוען...</div>;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-3 p-8">
        <p className="text-destructive">לא ניתן לטעון את החשבונית (ייתכן שאין לך הרשאה לצפות בה, או שהיא נמחקה).</p>
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
      <InvoiceDocumentView data={data} />
    </div>
  );
}
