import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { QUOTE_STATUS_LABELS } from "@repo/shared";
import { Button } from "@repo/ui";
import { Logo } from "../components/Logo";
import { formatCurrency, formatDate } from "../lib/format";
import { supabase } from "../lib/supabase";

// Shared print/PDF view for a single quote, reachable from both the admin
// panel (/admin/quotes/:id/print) and the customer portal
// (/portal/quotes/:id/print). It renders outside AppShell (no sidebar),
// so it's just the document itself — the browser's own "Print → Save as
// PDF" produces a clean, correctly RTL Hebrew PDF with zero extra
// dependencies or Hebrew-font embedding headaches.
export function QuotePrintPage() {
  const { id } = useParams<{ id: string }>();

  const { data: quote, isLoading: loadingQuote, error: quoteError } = useQuery({
    queryKey: ["quote-print", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").eq("id", id as string).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: customer } = useQuery({
    queryKey: ["quote-print-customer", quote?.customer_id],
    enabled: !!quote?.customer_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", quote?.customer_id as string).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: lineItems } = useQuery({
    queryKey: ["quote-print-line-items", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_line_items")
        .select("*")
        .eq("quote_id", id as string)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (loadingQuote) {
    return <div className="p-8 text-muted-foreground">טוען...</div>;
  }

  if (quoteError || !quote) {
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
    <div className="mx-auto max-w-3xl bg-card p-8 text-foreground print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link to=".." relative="path" className="text-sm text-primary underline">
          ← חזרה
        </Link>
        <Button onClick={() => window.print()}>הדפסה / שמירה כ-PDF</Button>
      </div>

      <div className="flex items-start justify-between border-b border-border pb-6">
        <Logo markClassName="h-12 w-12" wordmarkClassName="text-lg font-bold" />
        <div className="text-left text-sm text-muted-foreground">
          <p className="text-lg font-bold text-foreground">הצעת מחיר #{quote.quote_number}</p>
          <p>תאריך הפקה: {formatDate(quote.issued_date)}</p>
          {quote.valid_until && <p>בתוקף עד: {formatDate(quote.valid_until)}</p>}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm font-medium text-muted-foreground">לכבוד:</p>
        <p className="text-lg font-semibold">{customer?.name ?? "—"}</p>
        {customer?.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
        {customer?.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
        {customer?.address && <p className="text-sm text-muted-foreground">{customer.address}</p>}
      </div>

      <table className="mt-8 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-right text-muted-foreground">
            <th className="py-2 font-medium">תיאור</th>
            <th className="py-2 font-medium">כמות</th>
            <th className="py-2 font-medium">מחיר יחידה</th>
            <th className="py-2 font-medium">סה״כ</th>
          </tr>
        </thead>
        <tbody>
          {(lineItems ?? []).map((li) => (
            <tr key={li.id} className="border-b border-border/60">
              <td className="py-2">{li.description}</td>
              <td className="py-2">{li.quantity}</td>
              <td className="py-2">{formatCurrency(li.unit_price)}</td>
              <td className="py-2">{formatCurrency(li.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">סכום ביניים</span>
            <span>{formatCurrency(quote.subtotal)}</span>
          </div>
          {quote.discount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">הנחה</span>
              <span>-{formatCurrency(quote.discount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">מע״מ ({Math.round(quote.tax_rate * 100)}%)</span>
            <span>{formatCurrency(quote.tax_amount)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 text-base font-bold">
            <span>סה״כ לתשלום</span>
            <span>{formatCurrency(quote.total)}</span>
          </div>
        </div>
      </div>

      {quote.notes && (
        <div className="mt-8 border-t border-border pt-4 text-sm">
          <p className="font-medium text-muted-foreground">הערות:</p>
          <p className="whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}

      <div className="mt-10 text-center text-xs text-muted-foreground">
        סטטוס הצעת המחיר: {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
      </div>
    </div>
  );
}
