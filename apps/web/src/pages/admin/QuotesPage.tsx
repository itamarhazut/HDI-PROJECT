import * as React from "react";
import { Controller, useFieldArray, useForm, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  quoteSchema,
  type Quote,
  type Customer,
  type Job,
  type PriceListItem,
  QUOTE_STATUS_LABELS,
  strings,
} from "@repo/shared";
import {
  Button,
  Card,
  CardContent,
  Combobox,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Textarea,
  useToast,
} from "@repo/ui";
import { FormField } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { DetailToolbar } from "../../components/DetailToolbar";
import { StatusBadge } from "../../components/StatusBadge";
import { StatusSelect } from "../../components/StatusSelect";
import { IconFileText, IconShare, IconWhatsApp } from "../../components/icons";
import { QuickAddCustomerModal } from "../../components/QuickAddCustomerModal";
import { QuotePreviewModal } from "../../components/QuoteViewModal";
import { QuoteDocumentView, type QuoteDocumentData } from "../../components/QuoteDocumentView";
import { formatCurrency, formatDate } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { useQuoteSharing } from "../../hooks/useQuoteSharing";
import { useQuoteFooterText } from "../../hooks/useQuoteFooterText";
import { useVatRate } from "../../hooks/useVatRate";
import { supabase } from "../../lib/supabase";

const quoteFormSchema = quoteSchema.extend({
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]).optional(),
});
type QuoteFormInput = z.infer<typeof quoteFormSchema>;

// The list itself only browses/creates/searches — every row is a compact
// link into its own page (QuoteDetailPage), which is where viewing a
// quote's full details, editing it, turning it into a job, printing/
// sharing it and deleting it all happen. Same "compact list → its own
// detail page" split as CustomersPage / ExpensesPage, so clicking a quote
// doesn't have to share screen space with the rest of the list.
export function QuotesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = React.useState(false);
  const [creatingPreviewOpen, setCreatingPreviewOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const { data: quotes, isLoading } = useQuery({
    queryKey: ["quotes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
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

  // Shared hook (see useVatRate.ts) so this save path and the form's own
  // on-screen totals below can't disagree about the rate.
  const { vatRate } = useVatRate();

  const customerNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    (customers ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const create = useMutation({
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

      const { data, error } = await supabase.from("quotes").insert(quotePayload).select("id").single();
      if (error) throw error;

      const lineItemRows = values.line_items.map((li, index) => ({
        quote_id: data.id as string,
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
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      setCreating(false);
      toast({ title: "הצעת המחיר נשמרה בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת הצעת המחיר נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const filtered = (quotes ?? []).filter((q) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [String(q.quote_number), customerNameById.get(q.customer_id) ?? ""].some((v) =>
      v.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Pinned like every detail page's DetailToolbar — "+ הצעה חדשה" used
          to live only in PageHeader's action slot, which scrolls away with
          the rest of the page on a long list. Same fixed-to-top treatment,
          just with the page title standing in for the back link since a
          list page has nowhere to go back to. */}
      <DetailToolbar>
        <span className="text-sm font-medium text-muted-foreground">{strings.nav.quotes}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setCreating((v) => !v)}>+ הצעה חדשה</Button>
        </div>
      </DetailToolbar>
      <PageHeader
        title={strings.nav.quotes}
        description="רשימת הצעות המחיר — חיפוש ויצירה. לחיצה על הצעה פותחת את כל הפרטים שלה."
        icon={IconFileText}
        color="bg-sky-500"
      />

      {creating && (
        <QuoteForm
          initial={null}
          initialLineItems={[]}
          customers={customers ?? []}
          jobs={jobs ?? []}
          priceListItems={priceListItems ?? []}
          submitting={create.isPending}
          error={create.error instanceof Error ? create.error.message : null}
          onCancel={() => setCreating(false)}
          onSubmit={(values) => create.mutate(values)}
          previewOpen={creatingPreviewOpen}
          onPreviewOpenChange={setCreatingPreviewOpen}
        />
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <Input
            placeholder="חיפוש לפי מספר הצעה או לקוח..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          {isLoading ? (
            <TableSkeleton columns={5} />
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">{strings.common.noResults}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>מס׳</TableHead>
                  <TableHead>לקוח</TableHead>
                  <TableHead>{strings.common.status}</TableHead>
                  <TableHead>{strings.common.total}</TableHead>
                  <TableHead>הופקה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((q) => (
                  <TableRow key={q.id} onClick={() => navigate(`/admin/quotes/${q.id}`)} className="cursor-pointer">
                    <TableCell>#{q.quote_number}</TableCell>
                    <TableCell className="font-medium">{customerNameById.get(q.customer_id) ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={q.status} label={QUOTE_STATUS_LABELS[q.status] ?? q.status} />
                    </TableCell>
                    <TableCell>{formatCurrency(q.total)}</TableCell>
                    <TableCell>{formatDate(q.issued_date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface QuoteFormProps {
  initial: Quote | null;
  initialLineItems: {
    price_list_item_id: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    hide_price?: boolean;
  }[];
  customers: Customer[];
  jobs: Job[];
  priceListItems: PriceListItem[];
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: QuoteFormInput) => void;
  /** Controlled from the parent (not a local useState in here) so a pinned
   *  toolbar button outside this form — QuoteDetailPage's fixed
   *  DetailToolbar, while editing — can open the same preview modal without
   *  needing the person to scroll down to this form's own "תצוגה מקדימה"
   *  button first. QuotesPage's "create new" usage just keeps its own
   *  useState next to this call and passes it straight through. */
  previewOpen: boolean;
  onPreviewOpenChange: (open: boolean) => void;
}

// Exported so QuoteDetailPage can reuse the exact same fields/validation
// for editing an existing quote — this list page only ever uses it for
// creating a new one.
export function QuoteForm({
  initial,
  initialLineItems,
  customers,
  jobs,
  priceListItems,
  submitting,
  error,
  onCancel,
  onSubmit,
  previewOpen,
  onPreviewOpenChange,
}: QuoteFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<QuoteFormInput>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      customer_id: initial?.customer_id ?? "",
      job_id: initial?.job_id ?? "",
      issued_date: initial?.issued_date ?? new Date().toISOString().slice(0, 10),
      valid_until: initial?.valid_until ?? "",
      discount: initial?.discount ?? 0,
      discount_type: initial?.discount_type ?? "fixed",
      // New quotes default to no VAT (matches an "עוסק פטור" business, which
      // isn't allowed to charge it); editing an existing quote keeps whatever
      // it was saved with.
      include_vat: initial ? (initial.include_vat ?? true) : false,
      notes: initial?.notes ?? "",
      status: initial?.status ?? "draft",
      line_items:
        initialLineItems.length > 0
          ? initialLineItems.map((li) => ({
              price_list_item_id: li.price_list_item_id,
              description: li.description,
              quantity: li.quantity,
              unit_price: li.unit_price,
              hide_price: li.hide_price ?? false,
            }))
          : [{ price_list_item_id: null, description: "", quantity: 1, unit_price: 0, hide_price: false }],
    },
  });

  // The same rate the save path uses (see useVatRate.ts) — these on-screen
  // totals, the preview modal and the shared PDF all read it, so what the
  // customer is shown is exactly what gets stored.
  const { vatRate } = useVatRate();

  const { fields, append, remove } = useFieldArray({ control, name: "line_items" });
  const lineItems = watch("line_items");
  const discount = watch("discount");
  const discountType = watch("discount_type");
  const watchedCustomerId = watch("customer_id");
  const watchedNotes = watch("notes");
  const watchedIssuedDate = watch("issued_date");
  const watchedValidUntil = watch("valid_until");
  const includeVat = watch("include_vat");

  // Same fixed text on every quote (edited once on SettingsPage) — used
  // here so the live preview and the "share as PDF while editing" flow
  // below show it exactly like a saved quote does (see
  // useQuoteDocumentData.ts, which reads the identical setting).
  const { footerText } = useQuoteFooterText();

  const [quickAddOpen, setQuickAddOpen] = React.useState(false);

  const subtotal = lineItems.reduce((sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0), 0);
  const discountAmount =
    discountType === "percent" ? (subtotal * (Number(discount) || 0)) / 100 : Number(discount) || 0;
  const taxable = Math.max(0, subtotal - discountAmount);
  const estimatedTax = includeVat ? taxable * vatRate : 0;
  const estimatedTotal = taxable + estimatedTax;

  const previewData: QuoteDocumentData = {
    quoteNumberLabel: initial ? `#${initial.quote_number}` : "תצוגה מקדימה",
    issuedDate: watchedIssuedDate || null,
    validUntil: watchedValidUntil || null,
    status: (watch("status") as string) ?? "draft",
    customerName:
      customers.find((c) => c.id === watchedCustomerId)?.document_name ??
      customers.find((c) => c.id === watchedCustomerId)?.name ??
      "—",
    customerBusinessId: customers.find((c) => c.id === watchedCustomerId)?.business_id ?? null,
    // Same mobile-first phone + combined address/city logic as
    // useQuoteDocumentData.ts, so a live preview shows exactly what the
    // saved quote will show.
    customerPhone:
      customers.find((c) => c.id === watchedCustomerId)?.mobile_phone ||
      customers.find((c) => c.id === watchedCustomerId)?.phone ||
      null,
    customerEmail: customers.find((c) => c.id === watchedCustomerId)?.email ?? null,
    customerAddress:
      [
        customers.find((c) => c.id === watchedCustomerId)?.address,
        customers.find((c) => c.id === watchedCustomerId)?.city,
      ]
        .filter(Boolean)
        .join(", ") || null,
    lineItems: lineItems.map((li, i) => ({
      id: String(i),
      description: li.description,
      quantity: Number(li.quantity) || 0,
      unit_price: Number(li.unit_price) || 0,
      line_total: (Number(li.quantity) || 0) * (Number(li.unit_price) || 0),
      hidePrice: !!li.hide_price,
    })),
    subtotal,
    discount: discountAmount,
    discountType,
    discountPercent: discountType === "percent" ? Number(discount) || 0 : null,
    includeVat: !!includeVat,
    taxRate: vatRate,
    taxAmount: estimatedTax,
    total: estimatedTotal,
    notes: watchedNotes,
    footerText,
  };

  // Sharing an already-saved quote directly from the edit screen — built
  // straight from the current form values (like the preview), so it's
  // available immediately without a round trip to save + reopen the
  // "view" modal. Only offered once a quote actually exists (editing, not
  // creating), since sharing a not-yet-saved draft doesn't make sense.
  const sharing = useQuoteSharing(initial ? previewData : null);

  return (
    <Card>
      <CardContent className="p-4">
        {/* id lets QuoteDetailPage's fixed DetailToolbar submit this form
            with a `form="quote-form"` button while editing, so "שמור
            שינויים" is reachable without scrolling all the way down here
            first — same pattern as InspectionHeaderForm's sticky bar (see
            ResourceCategoryDetailPage). */}
        <form id="quote-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="לקוח" htmlFor="customer_id" error={errors.customer_id?.message}>
              <Controller
                name="customer_id"
                control={control}
                render={({ field }) => (
                  <Combobox
                    id="customer_id"
                    value={field.value}
                    onChange={field.onChange}
                    options={customers.map((c) => ({ value: c.id, label: c.name, sublabel: c.phone ?? undefined }))}
                    placeholder="בחר/י לקוח..."
                    actionLabel="+ לקוח חדש"
                    onAction={() => setQuickAddOpen(true)}
                  />
                )}
              />
            </FormField>
            <FormField label="עבודה מקושרת (אופציונלי)" htmlFor="job_id" error={errors.job_id?.message}>
              <Controller
                name="job_id"
                control={control}
                render={({ field }) => (
                  <Combobox
                    id="job_id"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    options={jobs.map((j) => ({ value: j.id, label: j.title }))}
                    placeholder="בחר/י עבודה..."
                    emptyOptionLabel="ללא"
                  />
                )}
              />
            </FormField>
            <FormField label="תאריך הפקה" htmlFor="issued_date" error={errors.issued_date?.message}>
              <Input id="issued_date" type="date" {...register("issued_date")} />
            </FormField>
            {/* valid_until was saved, shown on the quote page, in the customer
                portal and on the PDF — but had no input anywhere, so it was
                always empty. A quote with no expiry is a quote that stays
                binding forever, and copper prices move. */}
            <FormField label="בתוקף עד" htmlFor="valid_until" error={errors.valid_until?.message}>
              <Input id="valid_until" type="date" {...register("valid_until")} />
            </FormField>
            {/* Status is changed from the quick selector in the detail
                page's fixed toolbar instead of here — editing a quote's
                content and changing its status are separate actions, and
                the toolbar selector is reachable without opening this
                form at all. */}
          </div>

          {/* Positioned right here — immediately after the customer/dates
              fields and before the line items — so editing matches where
              this shows up on the actual document: the accent "הערות
              והבהרות" bar sits right above the line items table too (see
              QuoteDocumentView.tsx). It used to live down near the totals/
              submit buttons, disconnected from where it actually appears. */}
          <FormField label="הערות והבהרות" htmlFor="notes" error={errors.notes?.message}>
            <Textarea id="notes" {...register("notes")} />
          </FormField>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">פירוט שירותים</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({ price_list_item_id: null, description: "", quantity: 1, unit_price: 0, hide_price: false })
                }
              >
                + שורה
              </Button>
            </div>
            {errors.line_items?.message && <p className="text-sm text-destructive">{errors.line_items.message}</p>}
            <div className="flex flex-col gap-3">
              {fields.map((field, index) => (
                <LineItemRow
                  key={field.id}
                  index={index}
                  control={control}
                  register={register}
                  errors={errors}
                  priceListItems={priceListItems}
                  onRemove={fields.length > 1 ? () => remove(index) : undefined}
                  onPickPriceListItem={(itemId) => {
                    const item = priceListItems.find((p) => p.id === itemId);
                    if (item) {
                      setValue(`line_items.${index}.description`, item.name);
                      setValue(`line_items.${index}.unit_price`, item.unit_price);
                    }
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-start justify-end gap-2">
            <div className="flex w-48 flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="discount">הנחה</Label>
                {discountType === "percent" && discountAmount > 0 && (
                  <span className="text-xs text-muted-foreground">-{formatCurrency(discountAmount)}</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input id="discount" type="number" step="0.01" className="flex-1" {...register("discount")} />
                <Controller
                  name="discount_type"
                  control={control}
                  render={({ field }) => (
                    <StatusSelect
                      showDot={false}
                      className="w-16 shrink-0 px-2"
                      aria-label="סוג הנחה"
                      value={field.value}
                      onChange={field.onChange}
                      options={[
                        { value: "fixed" as const, label: "₪" },
                        { value: "percent" as const, label: "%" },
                      ]}
                    />
                  )}
                />
              </div>
              {errors.discount?.message && <p className="text-xs text-destructive">{errors.discount.message}</p>}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 border-t pt-3 text-sm">
            <label className="flex items-center gap-2 self-end text-sm">
              <input type="checkbox" {...register("include_vat")} className="h-4 w-4" />
              כולל מע״מ ({Math.round(vatRate * 100)}%)
            </label>
            {/* Order mirrors the issued document: subtotal, then VAT, then
                the discount, then the final total — the owner asked for
                this exact order so the editor's breakdown reads the same
                way as the PDF the customer receives. */}
            <div className="flex w-48 justify-between">
              <span className="text-muted-foreground">סכום ביניים</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {includeVat && (
              <div className="flex w-48 justify-between">
                <span className="text-muted-foreground">מע״מ ({Math.round(vatRate * 100)}%)</span>
                <span>{formatCurrency(estimatedTax)}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex w-48 justify-between">
                <span className="text-muted-foreground">
                  הנחה{discountType === "percent" ? ` (${Number(discount) || 0}%)` : ""}
                </span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex w-48 justify-between font-medium">
              <span>{strings.common.total}</span>
              <span>{formatCurrency(estimatedTotal)}</span>
            </div>
            {!includeVat && <span className="text-xs text-muted-foreground">* אינו כולל מע״מ (עוסק פטור)</span>}
          </div>

          {!initial && <input type="hidden" {...register("status")} />}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {initial ? (
              <Button type="submit" disabled={submitting}>
                שמור שינויים
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={handleSubmit((values) => onSubmit({ ...values, status: "draft" }))}
                >
                  שמור כטיוטה
                </Button>
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit((values) => onSubmit({ ...values, status: "sent" }))}
                >
                  הפק מסמך
                </Button>
              </>
            )}
            <Button type="button" variant="outline" onClick={() => onPreviewOpenChange(true)}>
              תצוגה מקדימה
            </Button>
            {initial && (
              <>
                {/* Icon-only, no label — matches QuoteDetailPage.tsx's
                    toolbar. "שיתוף במייל" dropped: on desktop it's the same
                    fallback (PDF download) as the generic share button, so
                    it wasn't earning its own button. */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-10 px-0"
                  aria-label="שיתוף"
                  title={sharing.busy === "share" ? "משתף..." : "שיתוף"}
                  onClick={sharing.shareGeneric}
                  disabled={sharing.busy !== null}
                >
                  <IconShare className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-10 px-0"
                  aria-label="שיתוף בוואטסאפ"
                  title={sharing.busy === "whatsapp" ? "משתף..." : "שיתוף בוואטסאפ"}
                  onClick={sharing.shareWhatsApp}
                  disabled={sharing.busy !== null}
                >
                  <IconWhatsApp className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button type="button" variant="outline" onClick={onCancel}>
              {strings.common.cancel}
            </Button>
          </div>
        </form>
      </CardContent>

      {quickAddOpen && (
        <QuickAddCustomerModal
          onClose={() => setQuickAddOpen(false)}
          onCreated={(id) => {
            setValue("customer_id", id);
            setQuickAddOpen(false);
          }}
        />
      )}
      {previewOpen && <QuotePreviewModal data={previewData} onClose={() => onPreviewOpenChange(false)} />}
      {/* Rendered off-screen (not display:none, so it still lays out and can
          be rasterized) purely so the share buttons above have something
          to turn into a PDF, built from the current form values — without
          this the person would have to save and reopen the "view" modal
          just to share. */}
      {initial && (
        // Explicit width matters here: this div is `position: fixed` with
        // only `left` set, which (unlike normal document flow) makes width
        // resolve via shrink-to-fit instead of expanding to fill available
        // space — so without a width, it was sizing itself to whatever was
        // narrower than QuoteDocumentView's own `max-w-3xl` (48rem), which
        // on a short quote (little text, few line items) could be
        // considerably less than 768px. elementToPdfBlob maps this
        // element's actual width onto a full A4 page width, so a narrower
        // rasterized width meant less usable page-height was "budgeted" in
        // the original element's own coordinate space — the same content,
        // measured against a narrower page, could overflow onto a second
        // page even for a short quote with barely any line items. Fixing
        // the width here to match max-w-3xl exactly removes that
        // dependency on content length entirely.
        <div style={{ position: "fixed", top: 0, left: "-9999px", width: "48rem", pointerEvents: "none" }} aria-hidden="true">
          <div ref={sharing.docRef}>
            <QuoteDocumentView data={previewData} fillPage />
          </div>
        </div>
      )}
    </Card>
  );
}

interface LineItemRowProps {
  index: number;
  control: Control<QuoteFormInput>;
  register: UseFormRegister<QuoteFormInput>;
  errors: FieldErrors<QuoteFormInput>;
  priceListItems: PriceListItem[];
  onRemove?: () => void;
  onPickPriceListItem: (itemId: string) => void;
}

function LineItemRow({ index, control, register, errors, priceListItems, onRemove, onPickPriceListItem }: LineItemRowProps) {
  const lineErrors = errors.line_items?.[index];
  return (
    <div className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-12 sm:items-end">
      <div className="sm:col-span-3 flex flex-col gap-1.5">
        <Controller
          name={`line_items.${index}.price_list_item_id`}
          control={control}
          render={({ field }) => {
            const selected = priceListItems.find((p) => p.id === field.value);
            return (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`line_items.${index}.price_list_item_id`}>פריט מהמחירון</Label>
                  {selected?.code && <span className="text-xs text-muted-foreground">מק״ט: {selected.code}</span>}
                </div>
                <Combobox
                  id={`line_items.${index}.price_list_item_id`}
                  value={field.value ?? ""}
                  onChange={(value) => {
                    field.onChange(value);
                    onPickPriceListItem(value);
                  }}
                  options={priceListItems.map((p) => ({
                    value: p.id,
                    label: p.name,
                    sublabel: p.code ?? undefined,
                  }))}
                  placeholder="חיפוש במחירון..."
                  emptyOptionLabel="ללא — מילוי ידני"
                />
              </>
            );
          }}
        />
      </div>
      <FormField
        label="תיאור"
        htmlFor={`line_items.${index}.description`}
        error={lineErrors?.description?.message}
        className="sm:col-span-4 flex flex-col gap-1.5"
      >
        <Input id={`line_items.${index}.description`} {...register(`line_items.${index}.description`)} />
      </FormField>
      <FormField
        label="כמות"
        htmlFor={`line_items.${index}.quantity`}
        error={lineErrors?.quantity?.message}
        className="sm:col-span-2 flex flex-col gap-1.5"
      >
        <Input id={`line_items.${index}.quantity`} type="number" step="0.01" {...register(`line_items.${index}.quantity`)} />
      </FormField>
      <FormField
        label="מחיר ליחידה"
        htmlFor={`line_items.${index}.unit_price`}
        error={lineErrors?.unit_price?.message}
        className="sm:col-span-2 flex flex-col gap-1.5"
      >
        <Input id={`line_items.${index}.unit_price`} type="number" step="0.01" {...register(`line_items.${index}.unit_price`)} />
      </FormField>
      <div className="sm:col-span-1 flex flex-col items-start gap-1.5">
        {/* Per-line "mask this row's price" toggle — shows as "****" instead
            of the real numbers on the document (columns stay, only the
            numbers hide), see QuoteDocumentView.tsx. Deliberately per row,
            not a single quote-wide setting: some lines' prices are fine to
            show, others aren't, on the same quote. */}
        <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
          <input type="checkbox" {...register(`line_items.${index}.hide_price`)} className="h-3.5 w-3.5" />
          הסתרת מחיר
        </label>
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            הסר
          </Button>
        )}
      </div>
    </div>
  );
}
