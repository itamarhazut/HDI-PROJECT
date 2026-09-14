import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  quoteSchema,
  type Quote,
  DEFAULT_VAT_RATE,
  QUOTE_STATUS_LABELS,
  strings,
} from "@repo/shared";
import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useConfirmDialog,
  useToast,
} from "@repo/ui";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { IconFileText } from "../../components/icons";
import { QuoteViewModal } from "../../components/QuoteViewModal";
import { getErrorMessage } from "../../lib/errors";
import { formatCurrency, formatDate } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { QuoteForm } from "./QuotesPage";

const quoteFormSchema = quoteSchema.extend({
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]).optional(),
});
type QuoteFormInput = z.infer<typeof quoteFormSchema>;

// The "quote card" you land on after clicking a row in QuotesPage —
// viewing all the details, editing, printing/sharing, turning it into a
// job and deleting all happen here instead of inline in the list, so
// opening one quote doesn't also show the rest of the list at the same
// time.
export function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = React.useState(false);
  const [viewingPdf, setViewingPdf] = React.useState(false);

  const { data: quote, isLoading } = useQuery({
    queryKey: ["quotes", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").eq("id", id as string).single();
      if (error) throw error;
      return data as Quote;
    },
    enabled: !!id,
  });

  const { data: customers } = useQuery({
    queryKey: ["customers", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: jobs } = useQuery({
    queryKey: ["jobs", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").order("title");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: priceListItems } = useQuery({
    queryKey: ["price_list_items", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("price_list_items").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: vatRate } = useQuery({
    queryKey: ["app_settings", "vat_rate"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("key", "vat_rate").maybeSingle();
      if (error) throw error;
      return typeof data?.value === "number" ? data.value : DEFAULT_VAT_RATE;
    },
  });

  const { data: lineItems, isFetching: loadingLineItems } = useQuery({
    queryKey: ["quote_line_items", id],
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

  // Just enough of each invoice to know which quotes already have one — so
  // "צור חשבונית" below doesn't offer to create a second invoice for the
  // same quote by mistake. Mirrors JobsPage's invoicedJobIds, keyed by
  // quote_id instead of job_id.
  const { data: invoicedQuoteIds } = useQuery({
    queryKey: ["invoices", "quote_ids"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("quote_id").not("quote_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((row) => row.quote_id as string));
    },
  });

  const customerNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    (customers ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  // The job that resulted from this quote (if any) — note this is the
  // reverse lookup: a job links back to the quote it came from via
  // job.quote_id, which is different from quote.job_id (a quote can be
  // pre-linked to an existing job before any job was created from it).
  const linkedJob = React.useMemo(() => (jobs ?? []).find((j) => j.quote_id === quote?.id), [jobs, quote?.id]);

  const update = useMutation({
    mutationFn: async (values: QuoteFormInput) => {
      const rate = vatRate ?? DEFAULT_VAT_RATE;
      const subtotal = values.line_items.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
      const discountAmount = values.discount_type === "percent" ? (subtotal * values.discount) / 100 : values.discount;
      const taxable = Math.max(0, subtotal - discountAmount);
      const taxAmount = values.include_vat ? taxable * rate : 0;
      const total = taxable + taxAmount;

      const quotePayload = {
        customer_id: values.customer_id,
        job_id: values.job_id || null,
        issued_date: values.issued_date || null,
        valid_until: values.valid_until || null,
        discount: values.discount,
        discount_type: values.discount_type,
        include_vat: values.include_vat,
        notes: values.notes || null,
        subtotal,
        tax_rate: rate,
        tax_amount: taxAmount,
        total,
        ...(values.status ? { status: values.status } : {}),
      };

      const { error } = await supabase.from("quotes").update(quotePayload).eq("id", id as string);
      if (error) throw error;
      const { error: delError } = await supabase.from("quote_line_items").delete().eq("quote_id", id as string);
      if (delError) throw delError;

      const lineItemRows = values.line_items.map((li, index) => ({
        quote_id: id as string,
        price_list_item_id: li.price_list_item_id || null,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        line_total: li.quantity * li.unit_price,
        sort_order: index,
      }));
      const { error: insError } = await supabase.from("quote_line_items").insert(lineItemRows);
      if (insError) throw insError;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["quotes", id] });
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      void queryClient.invalidateQueries({ queryKey: ["quote_line_items", id] });
      setEditing(false);
      toast({ title: "הצעת המחיר נשמרה בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת הצעת המחיר נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("quotes").delete().eq("id", id as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({ title: "הצעת המחיר נמחקה", variant: "success" });
      navigate("/admin/quotes");
    },
    onError: (err) => toast({ title: "מחיקת הצעת המחיר נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const convertToJob = useMutation({
    mutationFn: async (q: Quote) => {
      const { error } = await supabase.from("jobs").insert({
        customer_id: q.customer_id,
        quote_id: q.id,
        title: `עבודה עבור הצעת מחיר #${q.quote_number}`,
        status: "new",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "נוצרה עבודה חדשה מהצעת המחיר", variant: "success" });
    },
    onError: (err) => toast({ title: "יצירת העבודה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  // "צור חשבונית" — the actual point of this correction: issuing an
  // invoice to the customer once the job for this quote is done, from the
  // quote itself. Reuses the line items already loaded for this page
  // (no need to refetch quote_line_items, unlike JobsPage's version which
  // starts from a job and has to go fetch the quote first).
  const createInvoiceFromQuote = useMutation({
    mutationFn: async (q: Quote) => {
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          customer_id: q.customer_id,
          job_id: linkedJob?.id ?? null,
          quote_id: q.id,
          amount: q.total,
          issued_date: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (invoiceError) throw invoiceError;

      const rows = (lineItems ?? []).map((li, index) => ({
        invoice_id: invoice.id as string,
        price_list_item_id: li.price_list_item_id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        line_total: li.quantity * li.unit_price,
        sort_order: index,
      }));
      if (rows.length > 0) {
        const { error: insError } = await supabase.from("invoice_line_items").insert(rows);
        if (insError) throw insError;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "נוצרה חשבונית מהצעת המחיר", variant: "success" });
    },
    onError: (err) => toast({ title: "יצירת החשבונית נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const canCreateInvoice = Boolean(
    quote &&
      quote.status === "accepted" &&
      linkedJob?.status === "completed" &&
      !invoicedQuoteIds?.has(quote.id)
  );

  const formReady = !loadingLineItems;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">{strings.common.loading}</p>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">הצעת המחיר לא נמצאה.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        title={`הצעת מחיר #${quote.quote_number}`}
        description="כל הפרטים של הצעת המחיר."
        icon={IconFileText}
        color="bg-sky-500"
      />

      {editing && formReady && (
        <QuoteForm
          initial={quote}
          initialLineItems={lineItems ?? []}
          customers={customers ?? []}
          jobs={jobs ?? []}
          priceListItems={priceListItems ?? []}
          submitting={update.isPending}
          error={update.error instanceof Error ? update.error.message : null}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => update.mutate(values)}
        />
      )}
      {editing && !formReady && (
        <Card>
          <CardContent className="p-4 text-muted-foreground">{strings.common.loading}</CardContent>
        </Card>
      )}

      {!editing && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
              <StatusBadge status={quote.status} label={QUOTE_STATUS_LABELS[quote.status] ?? quote.status} />
              <span className="text-lg font-semibold">{formatCurrency(quote.total)}</span>
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">לקוח</dt>
                <dd className="text-sm font-medium">{customerNameById.get(quote.customer_id) ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">תאריך הפקה</dt>
                <dd className="text-sm font-medium">{formatDate(quote.issued_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">בתוקף עד</dt>
                <dd className="text-sm font-medium">{quote.valid_until ? formatDate(quote.valid_until) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">סכום ביניים</dt>
                <dd className="text-sm font-medium">{formatCurrency(quote.subtotal)}</dd>
              </div>
              {quote.include_vat && (
                <div>
                  <dt className="text-xs text-muted-foreground">מע״מ</dt>
                  <dd className="text-sm font-medium">{formatCurrency(quote.tax_amount)}</dd>
                </div>
              )}
              {quote.discount > 0 && (
                <div>
                  <dt className="text-xs text-muted-foreground">הנחה</dt>
                  <dd className="text-sm font-medium">
                    {quote.discount_type === "percent" ? `${quote.discount}%` : formatCurrency(quote.discount)}
                  </dd>
                </div>
              )}
            </dl>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">פירוט שירותים</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תיאור</TableHead>
                    <TableHead>כמות</TableHead>
                    <TableHead>מחיר ליחידה</TableHead>
                    <TableHead>סה״כ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lineItems ?? []).map((li) => (
                    <TableRow key={li.id}>
                      <TableCell>{li.description}</TableCell>
                      <TableCell>{li.quantity}</TableCell>
                      <TableCell>{formatCurrency(li.unit_price)}</TableCell>
                      <TableCell>{formatCurrency(li.line_total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {quote.notes && (
              <div>
                <p className="text-xs text-muted-foreground">הערות</p>
                <p className="whitespace-pre-wrap text-sm">{quote.notes}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                {strings.common.edit}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setViewingPdf(true)}>
                צפייה / PDF
              </Button>
              {quote.status === "accepted" && (
                <Button variant="secondary" size="sm" onClick={() => convertToJob.mutate(quote)}>
                  הפוך לעבודה
                </Button>
              )}
              {canCreateInvoice && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={createInvoiceFromQuote.isPending}
                  onClick={() => createInvoiceFromQuote.mutate(quote)}
                >
                  צור חשבונית
                </Button>
              )}
              {quote.status === "accepted" && linkedJob?.status === "completed" && invoicedQuoteIds?.has(quote.id) && (
                <span className="self-center text-sm text-muted-foreground">יש חשבונית ✓</span>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: "מחיקת הצעת מחיר",
                    description: `למחוק את הצעת המחיר #${quote.quote_number}? הפעולה אינה הפיכה.`,
                    confirmLabel: "מחק",
                    variant: "destructive",
                  });
                  if (ok) remove.mutate();
                }}
              >
                {strings.common.delete}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {viewingPdf && (
        <QuoteViewModal
          quoteId={quote.id}
          onClose={() => setViewingPdf(false)}
          printBasePath="/admin/quotes"
          allowShare
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/admin/quotes" className="text-sm font-medium text-muted-foreground hover:text-foreground">
      ‹ {strings.common.back} להצעות מחיר
    </Link>
  );
}
