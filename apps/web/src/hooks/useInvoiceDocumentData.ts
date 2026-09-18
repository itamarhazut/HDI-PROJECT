import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { InvoiceDocumentData } from "../components/InvoiceDocumentView";

// Fetches a saved invoice (+ its customer + line items) and shapes it into
// the InvoiceDocumentData the shared InvoiceDocumentView renders. Mirrors
// useQuoteDocumentData exactly, so a saved invoice always renders
// identically wherever it's opened from (the print route, the in-page
// "view" modal).
export function useInvoiceDocumentData(id: string | undefined) {
  const { data: invoice, isLoading: loadingInvoice, error: invoiceError } = useQuery({
    queryKey: ["invoice-print", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").eq("id", id as string).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: customer } = useQuery({
    queryKey: ["invoice-print-customer", invoice?.customer_id],
    enabled: !!invoice?.customer_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", invoice?.customer_id as string)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: lineItems } = useQuery({
    queryKey: ["invoice-print-line-items", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_line_items")
        .select("*")
        .eq("invoice_id", id as string)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const data: InvoiceDocumentData | null = invoice
    ? {
        invoiceNumberLabel: `#${invoice.invoice_number}`,
        issuedDate: invoice.issued_date,
        status: invoice.status,
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
        amount: invoice.amount,
        subtotal: invoice.subtotal,
        // Stored as the inputs to the calculation rather than the resulting
        // shekel figure, so derive it the same way the totals do.
        discountAmount: Math.max(0, Math.round((invoice.subtotal - (invoice.amount - invoice.tax_amount)) * 100) / 100),
        includeVat: invoice.include_vat,
        taxRate: invoice.tax_rate,
        taxAmount: invoice.tax_amount,
        notes: invoice.notes,
      }
    : null;

  return { data, isLoading: loadingInvoice, error: invoiceError };
}
