import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  quoteSchema,
  type Quote,
  type QuoteStatus,
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
import { DetailToolbar } from "../../components/DetailToolbar";
import { InvoiceViewModal } from "../../components/InvoiceViewModal";
import { PageHeader } from "../../components/PageHeader";
import { QuoteDocumentView } from "../../components/QuoteDocumentView";
import { StatusBadge } from "../../components/StatusBadge";
import { StatusSelect } from "../../components/StatusSelect";
import { IconFileText, IconShare, IconWhatsApp } from "../../components/icons";
import { QuoteViewModal } from "../../components/QuoteViewModal";
import { getErrorMessage } from "../../lib/errors";
import { formatCurrency, formatDate } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { useQuoteDocumentData } from "../../hooks/useQuoteDocumentData";
import { useQuoteSharing } from "../../hooks/useQuoteSharing";
import { useVatRate } from "../../hooks/useVatRate";
import { QuoteForm } from "./QuotesPage";

// Only used for its inferred type below (no runtime .parse()/.safeParse()
// call in this file) — prefixed with `_` so eslint's no-unused-vars (which
// only sees the `typeof` type-position reference, not a value use) doesn't
// flag it.
const _quoteFormSchema = quoteSchema.extend({
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]).optional(),
});
type QuoteFormInput = z.infer<typeof _quoteFormSchema>;

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
  const [searchParams, setSearchParams] = useSearchParams();
  // "שכפול" below lands here with ?edit=1 so the copy opens straight in the
  // edit form instead of a read view the person then has to open manually —
  // the whole point of duplicating is to tweak something before it's real.
  const [editing, setEditing] = React.useState(() => searchParams.get("edit") === "1");
  const [editPreviewOpen, setEditPreviewOpen] = React.useState(false);
  React.useEffect(() => {
    if (searchParams.get("edit") === "1") {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("edit");
          return next;
        },
        { replace: true }
      );
    }
    // Only ever meant to run once, off the URL this page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [viewingPdf, setViewingPdf] = React.useState(false);
  const [viewingInvoiceId, setViewingInvoiceId] = React.useState<string | null>(null);

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

  // Shared hook (see useVatRate.ts) — same rate the quote form and its PDF
  // use, so re-saving a quote here can't change its VAT out from under it.
  const { vatRate } = useVatRate();

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

  const customerNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    (customers ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  // The job that resulted from this quote (if any) — note this is the
  // reverse lookup: a job links back to the quote it came from via
  // job.quote_id, which is different from quote.job_id (a quote can be
  // pre-linked to an existing job before any job was created from it).
  // Marking a quote "accepted" auto-creates this job (see changeStatus
  // below), so by the time an invoice can be issued it should already
  // exist — this is just where "צור חשבונית" looks it up to link the two.
  const linkedJob = React.useMemo(() => (jobs ?? []).find((j) => j.quote_id === quote?.id), [jobs, quote?.id]);

  // Just enough to know whether this quote already has an invoice, so
  // "הנפקת חשבונית" opens the existing one instead of creating a second
  // one every time it's clicked.
  const { data: existingInvoiceId } = useQuery({
    queryKey: ["invoices", "by_quote", quote?.id],
    enabled: !!quote?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id")
        .eq("quote_id", quote?.id as string)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });

  const update = useMutation({
    mutationFn: async (values: QuoteFormInput) => {
      const rate = vatRate;
      const subtotal = values.line_items.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
      const discountAmount = values.discount_type === "percent" ? (subtotal * values.discount) / 100 : values.discount;
      const taxable = Math.max(0, subtotal - discountAmount);
      const taxAmount = values.include_vat ? taxable * rate : 0;
      const total = taxable + taxAmount;

      const quotePayload = {
        customer_id: values.customer_id,
        job_id: values.job_id || null,
        // quotes.issued_date is NOT NULL in the DB (defaults to today) — a
        // cleared field falls back to today rather than sending null, which
        // the column would reject.
        issued_date: values.issued_date || new Date().toISOString().slice(0, 10),
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
        hide_price: li.hide_price ?? false,
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

  // "שכפול" — a new draft quote with the same customer, line items,
  // discount and notes, so a repeat job or a quote a customer asked to be
  // revised doesn't mean retyping every line from scratch. Deliberately
  // starts clean on the parts that describe *this* quote's own history
  // rather than the work itself: status back to draft, issued_date reset to
  // today, valid_until cleared (a copied date could already be in the
  // past). Totals are recomputed from the copied line items against the
  // *current* VAT rate/setting rather than copied verbatim, in case either
  // changed since the original was made — same math as the create/update
  // mutations above.
  const duplicate = useMutation({
    mutationFn: async () => {
      if (!quote) throw new Error("Quote not loaded");
      const rate = vatRate;
      const rows = lineItems ?? [];
      const subtotal = rows.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
      const discountAmount = quote.discount_type === "percent" ? (subtotal * quote.discount) / 100 : quote.discount;
      const taxable = Math.max(0, subtotal - discountAmount);
      const taxAmount = quote.include_vat ? taxable * rate : 0;
      const total = taxable + taxAmount;

      const quotePayload = {
        customer_id: quote.customer_id,
        job_id: quote.job_id,
        status: "draft" as const,
        issued_date: new Date().toISOString().slice(0, 10),
        valid_until: null,
        discount: quote.discount,
        discount_type: quote.discount_type,
        include_vat: quote.include_vat,
        notes: quote.notes,
        subtotal,
        tax_rate: rate,
        tax_amount: taxAmount,
        total,
      };
      const { data, error } = await supabase.from("quotes").insert(quotePayload).select("id").single();
      if (error) throw error;

      const lineItemRows = rows.map((li, index) => ({
        quote_id: data.id as string,
        price_list_item_id: li.price_list_item_id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        line_total: li.quantity * li.unit_price,
        sort_order: index,
        hide_price: li.hide_price ?? false,
      }));
      if (lineItemRows.length > 0) {
        const { error: insError } = await supabase.from("quote_line_items").insert(lineItemRows);
        if (insError) throw insError;
      }
      return data.id as string;
    },
    onSuccess: (newId) => {
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({ title: "הצעת המחיר שוכפלה", variant: "success" });
      navigate(`/admin/quotes/${newId}?edit=1`);
    },
    onError: (err) => toast({ title: "השכפול נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  // Quick status change from the toolbar — deliberately separate from the
  // edit form (which used to have its own status field): changing where a
  // quote stands in the pipeline and editing its actual content are two
  // different actions, and this one is reachable without opening the form
  // at all. Saves immediately on selection, no separate save step.
  // Marking a quote "accepted" is what actually starts the job — no
  // separate "הפוך לעבודה" button: this creates one automatically, unless
  // this quote already has one (so toggling the status away and back
  // doesn't create a second job).
  const changeStatus = useMutation({
    mutationFn: async (status: QuoteStatus) => {
      const { error } = await supabase.from("quotes").update({ status }).eq("id", id as string);
      if (error) throw error;

      if (status === "accepted" && quote && !linkedJob) {
        const { error: jobError } = await supabase.from("jobs").insert({
          customer_id: quote.customer_id,
          quote_id: quote.id,
          title: `עבודה עבור הצעת מחיר #${quote.quote_number}`,
          status: "new",
        });
        if (jobError) throw jobError;
      }
    },
    onSuccess: (_data, status) => {
      void queryClient.invalidateQueries({ queryKey: ["quotes", id] });
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      if (status === "accepted") {
        void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      }
      toast({ title: "הסטטוס עודכן", variant: "success" });
    },
    onError: (err) => toast({ title: "עדכון הסטטוס נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  // "הנפקת חשבונית" — issuing an invoice to the customer straight from the
  // accepted quote, exactly like a quote is issued: create it, then open
  // the same kind of view/print/share modal a quote gets. Reuses the line
  // items already loaded for this page (no need to refetch
  // quote_line_items). If this quote already has an invoice, the toolbar
  // button skips straight to viewing it instead of calling this again.
  const createInvoiceFromQuote = useMutation({
    mutationFn: async (q: Quote) => {
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          customer_id: q.customer_id,
          job_id: linkedJob?.id ?? null,
          quote_id: q.id,
          // The whole money breakdown comes across, not just the total.
          // Copying only the total was what left the invoice unable to
          // survive an edit: its line items are pre-VAT, so re-saving
          // recomputed the total from them and dropped the tax.
          subtotal: q.subtotal,
          discount: q.discount ?? 0,
          discount_type: q.discount_type ?? "fixed",
          include_vat: q.include_vat ?? false,
          tax_rate: q.tax_rate,
          tax_amount: q.tax_amount ?? 0,
          amount: q.total,
          issued_date: new Date().toISOString().slice(0, 10),
          // Immediate payment terms.
          due_date: new Date().toISOString().slice(0, 10),
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
      return invoice.id as string;
    },
    onSuccess: (invoiceId) => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["invoices", "by_quote", quote?.id] });
      toast({ title: "נוצרה חשבונית מהצעת המחיר", variant: "success" });
      setViewingInvoiceId(invoiceId);
    },
    onError: (err) => toast({ title: "יצירת החשבונית נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  // Sharing lives in the toolbar now, next to עריכה/צפייה/מחיקה, instead of
  // inside the "צפייה / PDF" modal — reachable in one click without
  // opening anything first. Fetches its own copy of the document data
  // (same hook the view modal itself used to use internally) and renders
  // it off-screen purely so there's something to rasterize into the
  // shared PDF; mirrors the identical pattern in QuotesPage's QuoteForm
  // (live-editing screen).
  const { data: shareDocumentData } = useQuoteDocumentData(quote?.id);
  const sharing = useQuoteSharing(shareDocumentData ?? null);

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
      <DetailToolbar>
        <Link to="/admin/quotes" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ {strings.common.back} להצעות מחיר
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* While editing, the form's own Save/Cancel/Preview sit at the
              bottom of a potentially long form (many line items) — reaching
              them meant scrolling all the way down every time. Pinning the
              same three actions here too (Save submits the form by id, same
              pattern as InspectionHeaderForm's sticky bar) means they're
              reachable the instant editing starts, without removing the
              in-form buttons that QuotesPage's "create new" usage still
              needs. */}
          {editing && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditPreviewOpen(true)}>
                תצוגה מקדימה
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                {strings.common.cancel}
              </Button>
              <Button type="submit" form="quote-form" size="sm" disabled={update.isPending}>
                שמור שינויים
              </Button>
            </>
          )}
          {!editing && (
            <>
              <StatusSelect
                aria-label={strings.common.status}
                value={quote.status}
                disabled={changeStatus.isPending}
                onChange={(status) => changeStatus.mutate(status)}
                options={Object.entries(QUOTE_STATUS_LABELS)
                  // "פגה תוקף" removed from the choices — not a status
                  // anyone picks going forward. Left out of the options
                  // list only, not the underlying type/label map, so any
                  // older quote that already has this status still shows
                  // its badge correctly.
                  .filter(([value]) => value !== "expired")
                  .map(([value, label]) => ({
                    value: value as QuoteStatus,
                    label,
                  }))}
              />
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                {strings.common.edit}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!formReady || duplicate.isPending}
                onClick={() => duplicate.mutate()}
              >
                {duplicate.isPending ? "משכפל..." : "שכפול"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setViewingPdf(true)}>
                צפייה / PDF
              </Button>
              {/* Icon-only, no label — just the two channels that matter
                  day to day (a generic share sheet, and WhatsApp
                  specifically). "שיתוף במייל" was dropped rather than made
                  icon-only: it's the same underlying action as "שיתוף" on
                  desktop (no native share sheet → falls back to a PDF
                  download either way), so it wasn't earning its own button. */}
              <Button
                variant="outline"
                size="sm"
                className="w-9 px-0"
                aria-label="שיתוף"
                title={sharing.busy === "share" ? "משתף..." : "שיתוף"}
                onClick={sharing.shareGeneric}
                disabled={!shareDocumentData || sharing.busy !== null}
              >
                <IconShare className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-9 px-0"
                aria-label="שיתוף בוואטסאפ"
                title={sharing.busy === "whatsapp" ? "משתף..." : "שיתוף בוואטסאפ"}
                onClick={sharing.shareWhatsApp}
                disabled={!shareDocumentData || sharing.busy !== null}
              >
                <IconWhatsApp className="h-4 w-4" />
              </Button>
              {quote.status === "accepted" && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={createInvoiceFromQuote.isPending}
                  onClick={() => {
                    if (existingInvoiceId) {
                      setViewingInvoiceId(existingInvoiceId);
                    } else {
                      createInvoiceFromQuote.mutate(quote);
                    }
                  }}
                >
                  {existingInvoiceId ? "צפייה בחשבונית" : "הנפקת חשבונית"}
                </Button>
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
            </>
          )}
        </div>
      </DetailToolbar>
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
          previewOpen={editPreviewOpen}
          onPreviewOpenChange={setEditPreviewOpen}
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
          </CardContent>
        </Card>
      )}

      {viewingPdf && (
        <QuoteViewModal quoteId={quote.id} onClose={() => setViewingPdf(false)} printBasePath="/admin/quotes" />
      )}

      {viewingInvoiceId && (
        <InvoiceViewModal
          invoiceId={viewingInvoiceId}
          onClose={() => setViewingInvoiceId(null)}
          printBasePath="/admin/invoices"
        />
      )}

      {/* Rendered off-screen purely so the toolbar's share buttons above
          have something to rasterize into a PDF — see QuotesPage's
          QuoteForm for the identical pattern used while live-editing. */}
      {shareDocumentData && (
        // Explicit width — see the identical comment in QuotesPage.tsx's
        // QuoteForm next to the same pattern: without it, a short quote's
        // hidden PDF-source div can shrink-wrap narrower than
        // QuoteDocumentView's own max-w-3xl, which throws off
        // elementToPdfBlob's page-height budget and can force even a
        // short quote onto two pages.
        <div style={{ position: "fixed", top: 0, left: "-9999px", width: "48rem", pointerEvents: "none" }} aria-hidden="true">
          <div ref={sharing.docRef}>
            <QuoteDocumentView data={shareDocumentData} fillPage />
          </div>
        </div>
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
