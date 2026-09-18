import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  invoiceSchema,
  invoicePaymentSchema,
  type Invoice,
  type InvoicePayment,
  type InvoicePaymentInput,
  type PaymentMethod,
  PAYMENT_METHOD_LABELS,
  strings,
} from "@repo/shared";
import {
  Button,
  Card,
  CardContent,
  Input,
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
import { FormField } from "../../components/FormField";
import { InvoiceDocumentView } from "../../components/InvoiceDocumentView";
import { InvoiceViewModal } from "../../components/InvoiceViewModal";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { StatusSelect } from "../../components/StatusSelect";
import { IconMail, IconReceipt, IconShare, IconWhatsApp } from "../../components/icons";
import { getErrorMessage } from "../../lib/errors";
import { formatCurrency, formatDate } from "../../lib/format";
import { computeDocumentTotals } from "../../lib/money";
import { invoiceBalanceState } from "../../lib/invoiceStatus";
import { supabase } from "../../lib/supabase";
import { useVatRate } from "../../hooks/useVatRate";
import { useInvoiceDocumentData } from "../../hooks/useInvoiceDocumentData";
import { useInvoiceSharing } from "../../hooks/useInvoiceSharing";
import { InvoiceForm } from "./InvoicesPage";

// Only used for its inferred type below (no runtime .parse()/.safeParse()
// call in this file) — prefixed with `_` so eslint's no-unused-vars (which
// only sees the `typeof` type-position reference, not a value use) doesn't
// flag it.
const _invoiceFormSchema = invoiceSchema.extend({
  status: z.enum(["pending", "marked_invoiced", "paid", "overdue", "cancelled"]).optional(),
});
type InvoiceFormInput = z.infer<typeof _invoiceFormSchema>;

// The "invoice card" you land on after clicking a row in InvoicesPage —
// viewing all the details, editing and deleting all happen here instead
// of inline in the list, so opening one invoice doesn't also show the
// rest of the list at the same time.
export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = React.useState(false);
  const [viewingPdf, setViewingPdf] = React.useState(false);
  const [addingPayment, setAddingPayment] = React.useState(false);
  const { vatRate } = useVatRate();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoices", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").eq("id", id as string).single();
      if (error) throw error;
      return data as Invoice;
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

  const { data: quotes } = useQuery({
    queryKey: ["quotes", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").order("quote_number", { ascending: false });
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

  const { data: lineItems, isFetching: loadingLineItems } = useQuery({
    queryKey: ["invoice_line_items", id],
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

  const customerNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    (customers ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const jobTitleById = React.useMemo(() => {
    const map = new Map<string, string>();
    (jobs ?? []).forEach((j) => map.set(j.id, j.title));
    return map;
  }, [jobs]);

  const update = useMutation({
    mutationFn: async (values: InvoiceFormInput) => {
      const { line_items, ...rest } = values;
      // This is the fix for the bug where saving an invoice quietly removed
      // its VAT: the total used to be recomputed as the bare sum of the
      // line items, which are stored pre-VAT and pre-discount. Now the
      // whole breakdown is computed together and stored with the invoice,
      // so it survives every edit.
      const totals = computeDocumentTotals({
        lineItems: line_items,
        discount: rest.discount,
        discountType: rest.discount_type,
        includeVat: rest.include_vat,
        vatRate,
        fallbackAmount: rest.amount,
      });
      const payload = {
        customer_id: rest.customer_id,
        job_id: rest.job_id || null,
        quote_id: rest.quote_id || null,
        subtotal: totals.subtotal,
        discount: rest.discount,
        discount_type: rest.discount_type,
        include_vat: rest.include_vat,
        tax_rate: vatRate,
        tax_amount: totals.taxAmount,
        amount: totals.total,
        issued_date: rest.issued_date || null,
        due_date: rest.due_date || rest.issued_date || null,
        allocation_number: rest.allocation_number || null,
        external_provider: rest.external_provider || null,
        external_reference: rest.external_reference || null,
        external_url: rest.external_url || null,
        notes: rest.notes || null,
        ...(rest.status ? { status: rest.status } : {}),
      };
      const { error } = await supabase.from("invoices").update(payload).eq("id", id as string);
      if (error) throw error;
      const { error: delError } = await supabase.from("invoice_line_items").delete().eq("invoice_id", id as string);
      if (delError) throw delError;

      if (line_items.length > 0) {
        const lineItemRows = line_items.map((li, index) => ({
          invoice_id: id as string,
          price_list_item_id: li.price_list_item_id || null,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          line_total: li.quantity * li.unit_price,
          sort_order: index,
        }));
        const { error: insError } = await supabase.from("invoice_line_items").insert(lineItemRows);
        if (insError) throw insError;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices", id] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["invoice_line_items", id] });
      setEditing(false);
      toast({ title: "החשבונית נשמרה בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת החשבונית נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  // The payment ledger. The invoice's balance, its paid_date and whether it
  // counts as paid are all derived from these rows by a database trigger —
  // nothing here writes those fields directly.
  const { data: payments } = useQuery({
    queryKey: ["invoice_payments", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_payments")
        .select("*")
        .eq("invoice_id", id as string)
        .order("paid_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InvoicePayment[];
    },
  });

  const refreshInvoiceAndPayments = () => {
    void queryClient.invalidateQueries({ queryKey: ["invoice_payments", id] });
    void queryClient.invalidateQueries({ queryKey: ["invoices", id] });
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  const addPayment = useMutation({
    mutationFn: async (values: InvoicePaymentInput) => {
      const { error } = await supabase.from("invoice_payments").insert({
        invoice_id: id as string,
        paid_at: values.paid_at,
        amount: values.amount,
        method: values.method || null,
        reference: values.reference || null,
        notes: values.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refreshInvoiceAndPayments();
      setAddingPayment(false);
      toast({ title: "התשלום נרשם", variant: "success" });
    },
    onError: (err) => toast({ title: "רישום התשלום נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  const deletePayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.from("invoice_payments").delete().eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      refreshInvoiceAndPayments();
      toast({ title: "התשלום נמחק", variant: "success" });
    },
    onError: (err) => toast({ title: "מחיקת התשלום נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("invoices").delete().eq("id", id as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "החשבונית נמחקה", variant: "success" });
      navigate("/admin/quotes?tab=invoices");
    },
    onError: (err) => toast({ title: "מחיקת החשבונית נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  // Sharing lives in the toolbar now, next to עריכה/צפייה/מחיקה, instead of
  // inside the "צפייה / PDF" modal — see QuoteDetailPage for the identical
  // pattern (there in more detail).
  const { data: shareDocumentData } = useInvoiceDocumentData(invoice?.id);
  const sharing = useInvoiceSharing(shareDocumentData ?? null);

  const formReady = !loadingLineItems;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">{strings.common.loading}</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">החשבונית לא נמצאה.</p>
      </div>
    );
  }

  // Paid / partially paid / overdue, worked out from the payment ledger and
  // the due date rather than from a stored flag — see lib/invoiceStatus.ts.
  const balance = invoiceBalanceState(invoice);

  return (
    <div className="flex flex-col gap-6">
      <DetailToolbar>
        <Link to="/admin/quotes?tab=invoices" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ {strings.common.back} לחשבוניות
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Pinned Cancel/Save while editing — the form's own buttons sit
              at the bottom of a potentially long form, so without this
              they'd only be reachable after scrolling all the way down.
              Save submits the form by id (same pattern as
              InspectionHeaderForm's sticky bar). */}
          {editing && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                {strings.common.cancel}
              </Button>
              <Button type="submit" form="invoice-form" size="sm" disabled={update.isPending}>
                {strings.common.save}
              </Button>
            </>
          )}
          {!editing && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                {strings.common.edit}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setViewingPdf(true)}>
                צפייה / PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={sharing.shareGeneric}
                disabled={!shareDocumentData || sharing.busy !== null}
              >
                <IconShare className="h-4 w-4" />
                {sharing.busy === "share" ? "משתף..." : "שיתוף"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={sharing.shareEmail}
                disabled={!shareDocumentData || sharing.busy !== null}
              >
                <IconShare className="h-3.5 w-3.5 opacity-60" />
                <IconMail className="h-4 w-4" />
                {sharing.busy === "email" ? "משתף..." : "שיתוף במייל"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={sharing.shareWhatsApp}
                disabled={!shareDocumentData || sharing.busy !== null}
              >
                <IconShare className="h-3.5 w-3.5 opacity-60" />
                <IconWhatsApp className="h-4 w-4" />
                {sharing.busy === "whatsapp" ? "משתף..." : "שיתוף בוואטסאפ"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: "מחיקת חשבונית",
                    description: `למחוק את חשבונית #${invoice.invoice_number}? הפעולה אינה הפיכה.`,
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
        title={`חשבונית #${invoice.invoice_number}`}
        description="כל הפרטים של החשבונית."
        icon={IconReceipt}
        color="bg-emerald-500"
      />

      {editing && formReady && (
        <InvoiceForm
          initial={invoice}
          initialLineItems={lineItems ?? []}
          customers={customers ?? []}
          jobs={jobs ?? []}
          quotes={quotes ?? []}
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge status={balance.badgeStatus} label={balance.label} />
              <div className="text-end">
                <span className="text-lg font-semibold">{formatCurrency(invoice.amount)}</span>
                {balance.balance > 0 && balance.paid > 0 && (
                  <p className="text-xs text-muted-foreground">
                    שולם {formatCurrency(balance.paid)} · נותרו {formatCurrency(balance.balance)}
                  </p>
                )}
              </div>
            </div>

            {/* The breakdown behind the total. An invoice used to store only
                the final number, which is what allowed an edit to recompute
                it from pre-VAT rows and lose the tax. */}
            {(invoice.include_vat || invoice.discount > 0) && (
              <div className="flex flex-col items-end gap-1 border-b pb-3 text-sm">
                <div className="flex w-56 justify-between">
                  <span className="text-muted-foreground">סכום ביניים</span>
                  <span>{formatCurrency(invoice.subtotal)}</span>
                </div>
                {invoice.discount > 0 && (
                  <div className="flex w-56 justify-between">
                    <span className="text-muted-foreground">
                      הנחה{invoice.discount_type === "percent" ? ` (${invoice.discount}%)` : ""}
                    </span>
                    <span>-{formatCurrency(invoice.subtotal - (invoice.amount - invoice.tax_amount))}</span>
                  </div>
                )}
                {invoice.include_vat && (
                  <div className="flex w-56 justify-between">
                    <span className="text-muted-foreground">מע״מ ({Math.round(invoice.tax_rate * 100)}%)</span>
                    <span>{formatCurrency(invoice.tax_amount)}</span>
                  </div>
                )}
                <div className="flex w-56 justify-between font-medium">
                  <span>{strings.common.total}</span>
                  <span>{formatCurrency(invoice.amount)}</span>
                </div>
              </div>
            )}

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">לקוח</dt>
                <dd className="text-sm font-medium">{customerNameById.get(invoice.customer_id) ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">תאריך הפקה</dt>
                <dd className="text-sm font-medium">{formatDate(invoice.issued_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">לתשלום עד</dt>
                <dd
                  className={
                    balance.state === "overdue" ? "text-sm font-medium text-destructive" : "text-sm font-medium"
                  }
                >
                  {formatDate(invoice.due_date ?? invoice.issued_date)}
                  {balance.state === "overdue" && ` · באיחור ${balance.daysLate} ימים`}
                </dd>
              </div>
              {invoice.allocation_number && (
                <div>
                  <dt className="text-xs text-muted-foreground">מספר הקצאה</dt>
                  <dd className="text-sm font-medium" dir="ltr">
                    {invoice.allocation_number}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">עבודה מקושרת</dt>
                <dd className="text-sm font-medium">{invoice.job_id ? jobTitleById.get(invoice.job_id) ?? "—" : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">הצעת מחיר מקושרת</dt>
                <dd className="text-sm font-medium">
                  {invoice.quote_id ? `#${(quotes ?? []).find((q) => q.id === invoice.quote_id)?.quote_number ?? "—"}` : "—"}
                </dd>
              </div>
              {(invoice.external_provider || invoice.external_reference || invoice.external_url) && (
                <>
                  <div>
                    <dt className="text-xs text-muted-foreground">ספק חיצוני</dt>
                    <dd className="text-sm font-medium">{invoice.external_provider ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">מספר אסמכתא</dt>
                    <dd className="text-sm font-medium">{invoice.external_reference ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">קישור חיצוני</dt>
                    <dd className="text-sm font-medium">
                      {invoice.external_url ? (
                        <a href={invoice.external_url} target="_blank" rel="noreferrer" className="text-primary underline">
                          פתיחה
                        </a>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                </>
              )}
            </dl>

            {(lineItems ?? []).length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">פירוט פריטים</p>
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
            )}

            {invoice.notes && (
              <div>
                <p className="text-xs text-muted-foreground">הערות</p>
                <p className="whitespace-pre-wrap text-sm">{invoice.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!editing && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">תשלומים</p>
                <p className="text-xs text-muted-foreground">
                  {balance.balance > 0
                    ? `נותרו לתשלום ${formatCurrency(balance.balance)} מתוך ${formatCurrency(invoice.amount)}`
                    : "החשבונית שולמה במלואה."}
                </p>
              </div>
              {balance.state !== "cancelled" && balance.balance > 0 && (
                <Button size="sm" onClick={() => setAddingPayment((v) => !v)}>
                  {addingPayment ? strings.common.cancel : "+ רישום תשלום"}
                </Button>
              )}
            </div>

            {addingPayment && (
              <PaymentForm
                defaultAmount={balance.balance}
                submitting={addPayment.isPending}
                error={addPayment.error instanceof Error ? addPayment.error.message : null}
                onCancel={() => setAddingPayment(false)}
                onSubmit={(values) => addPayment.mutate(values)}
              />
            )}

            {(payments ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">עדיין לא נרשמו תשלומים.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>סכום</TableHead>
                    <TableHead>אמצעי</TableHead>
                    <TableHead>אסמכתא</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payments ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.paid_at)}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(p.amount)}</TableCell>
                      <TableCell>{p.method ? PAYMENT_METHOD_LABELS[p.method] ?? p.method : "—"}</TableCell>
                      <TableCell>{p.reference || "—"}</TableCell>
                      <TableCell className="text-end">
                        <button
                          type="button"
                          className="text-xs font-medium text-destructive hover:underline"
                          disabled={deletePayment.isPending}
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: "מחיקת תשלום",
                              description: `למחוק את התשלום על סך ${formatCurrency(p.amount)}?`,
                              confirmLabel: "מחק",
                              variant: "destructive",
                            });
                            if (ok) deletePayment.mutate(p.id);
                          }}
                        >
                          {strings.common.delete}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {viewingPdf && (
        <InvoiceViewModal invoiceId={invoice.id} onClose={() => setViewingPdf(false)} printBasePath="/admin/invoices" />
      )}

      {/* Rendered off-screen purely so the toolbar's share buttons above
          have something to rasterize into a PDF — see QuoteDetailPage for
          the identical pattern. */}
      {shareDocumentData && (
        <div style={{ position: "fixed", top: 0, left: "-9999px", pointerEvents: "none" }} aria-hidden="true">
          <div ref={sharing.docRef}>
            <InvoiceDocumentView data={shareDocumentData} />
          </div>
        </div>
      )}
    </div>
  );
}

interface PaymentFormProps {
  defaultAmount: number;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: InvoicePaymentInput) => void;
}

// Recording money received. Defaults to today and to the full outstanding
// balance, since that's the common case — a deposit is just typing a
// smaller number, and the remaining balance recalculates itself.
function PaymentForm({ defaultAmount, submitting, error, onCancel, onSubmit }: PaymentFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<InvoicePaymentInput>({
    resolver: zodResolver(invoicePaymentSchema),
    defaultValues: {
      paid_at: new Date().toISOString().slice(0, 10),
      amount: defaultAmount,
      method: "",
      reference: "",
      notes: "",
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 rounded-md border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="תאריך" htmlFor="paid_at" error={errors.paid_at?.message}>
          <Input id="paid_at" type="date" {...register("paid_at")} />
        </FormField>
        <FormField label="סכום (₪)" htmlFor="payment_amount" error={errors.amount?.message}>
          <Input id="payment_amount" type="number" step="0.01" {...register("amount")} />
        </FormField>
        <FormField label="אמצעי תשלום" htmlFor="method" error={errors.method?.message}>
          <Controller
            name="method"
            control={control}
            render={({ field }) => (
              <StatusSelect
                id="method"
                showDot={false}
                value={field.value ?? ""}
                onChange={field.onChange}
                options={[
                  { value: "" as const, label: "ללא" },
                  ...Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
                    value: value as PaymentMethod,
                    label,
                  })),
                ]}
              />
            )}
          />
        </FormField>
        <FormField label="אסמכתא" htmlFor="reference" error={errors.reference?.message}>
          <Input id="reference" placeholder="מס׳ צ׳ק / העברה" {...register("reference")} />
        </FormField>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {strings.common.save}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {strings.common.cancel}
        </Button>
      </div>
    </form>
  );
}

function BackLink() {
  return (
    <Link to="/admin/quotes?tab=invoices" className="text-sm font-medium text-muted-foreground hover:text-foreground">
      ‹ {strings.common.back} לחשבוניות
    </Link>
  );
}
