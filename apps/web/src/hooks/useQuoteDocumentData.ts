import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { QuoteDocumentData } from "../components/QuoteDocumentView";
import { useQuoteFooterText } from "./useQuoteFooterText";

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

  // Same fixed text on every quote (edited once on SettingsPage) — see
  // useQuoteFooterText.ts.
  const { footerText } = useQuoteFooterText();

  const data: QuoteDocumentData | null = quote
    ? {
        quoteNumberLabel: `#${quote.quote_number}`,
        issuedDate: quote.issued_date,
        validUntil: quote.valid_until,
        status: quote.status,
        // document_name is the override for what to print on a document
        // when it should read differently from the contact name on file
        // (e.g. a company name) — falling back to .name only when it's
        // unset, same as every other place a customer's name reaches a
        // document.
        customerName: customer?.document_name ?? customer?.name ?? "",
        customerBusinessId: customer?.business_id,
        // Customers have two separate phone fields (a landline "phone" and
        // a "mobile_phone") — most customer records only ever have the
        // mobile one filled in, so preferring it (falling back to the
        // landline) is what actually gets a number to show on the document
        // instead of silently showing nothing.
        customerPhone: customer?.mobile_phone || customer?.phone || null,
        customerEmail: customer?.email,
        // "address" and "city" are separate columns — combined here into
        // one line the way a person would actually write it out.
        customerAddress: [customer?.address, customer?.city].filter(Boolean).join(", ") || null,
        lineItems: (lineItems ?? []).map((li) => ({
          id: li.id,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          line_total: li.line_total,
          hidePrice: li.hide_price ?? false,
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
        footerText,
      }
    : null;

  return { data, isLoading: loadingQuote, error: quoteError };
}
