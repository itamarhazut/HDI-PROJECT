import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { QuoteDocumentData } from "../components/QuoteDocumentView";

// Fetches a saved quote (+ its customer + line items) and shapes it into
// the QuoteDocumentData the shared QuoteDocumentView renders. Used by both
// the dedicated print route and the in-page "view" modal, so a saved
// quote always renders identically wherever it's opened from.
export function useQuoteDocumentData(id: string | undefined) {
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

  const discountType = quote?.discount_type ?? "fixed";
  const discountAmount = quote
    ? discountType === "percent"
      ? (quote.subtotal * quote.discount) / 100
      : quote.discount
    : 0;

  const data: QuoteDocumentData | null = quote
    ? {
        quoteNumberLabel: `#${quote.quote_number}`,
        issuedDate: quote.issued_date,
        validUntil: quote.valid_until,
        status: quote.status,
        customerName: customer?.name ?? "",
        customerPhone: customer?.phone,
        customerEmail: customer?.email,
        customerAddress: customer?.address,
        lineItems: (lineItems ?? []).map((li) => ({
          id: li.id,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          line_total: li.line_total,
        })),
        subtotal: quote.subtotal,
        discount: discountAmount,
        discountType,
        discountPercent: discountType === "percent" ? quote.discount : null,
        includeVat: quote.include_vat ?? true,
        taxRate: quote.tax_rate,
        taxAmount: quote.tax_amount,
        total: quote.total,
        notes: quote.notes,
      }
    : null;

  return { data, isLoading: loadingQuote, error: quoteError };
}
