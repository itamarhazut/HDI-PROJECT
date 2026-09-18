import * as React from "react";
import { Controller, useFieldArray, useForm, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  invoiceSchema,
  type Invoice,
  type Customer,
  type Job,
  type Quote,
  type PriceListItem,
  type InvoiceStatus,
  INVOICE_STATUS_LABELS,
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
import { IconReceipt } from "../../components/icons";
import { formatCurrency, formatDate } from "../../lib/format";
import { computeDocumentTotals } from "../../lib/money";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";
import { invoiceBalanceState } from "../../lib/invoiceStatus";
import { useVatRate } from "../../hooks/useVatRate";

const invoiceFormSchema = invoiceSchema.extend({
  status: z.enum(["pending", "marked_invoiced", "paid", "overdue", "cancelled"]).optional(),
});
type InvoiceFormInput = z.infer<typeof invoiceFormSchema>;

// The list itself only browses/creates/searches — every row is a compact
// link into its own page (InvoiceDetailPage), which is where viewing an
// invoice's full details, editing it and deleting it all happen. Same
// "compact list → its own detail page" split as CustomersPage /
// ExpensesPage / QuotesPage, so clicking an invoice doesn't have to share
// screen space with the rest of the list.
export function InvoicesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const { vatRate } = useVatRate();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
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

  const { data: quotes } = useQuery({
    queryKey: ["quotes", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").order("quote_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Lets an invoice's line items reuse a price-list item the same way a
  // quote's line items do (see QuotesPage) — same query, same picker UX.
  const { data: priceListItems } = useQuery({
    queryKey: ["price_list_items", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("price_list_items").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const customerNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    (customers ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const create = useMutation({
    mutationFn: async (values: InvoiceFormInput) => {
      const { line_items, ...rest } = values;
      // Shared with the quote form and the form's own on-screen totals (see
      // lib/money.ts) so the stored breakdown is exactly what was shown.
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
        // Immediate terms: due the day it's issued unless told otherwise.
        due_date: rest.due_date || rest.issued_date || null,
        allocation_number: rest.allocation_number || null,
        external_provider: rest.external_provider || null,
        external_reference: rest.external_reference || null,
        external_url: rest.external_url || null,
        notes: rest.notes || null,
      };
      const { data, error } = await supabase.from("invoices").insert(payload).select("id").single();
      if (error) throw error;

      if (line_items.length > 0) {
        const lineItemRows = line_items.map((li, index) => ({
          invoice_id: data.id as string,
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
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setCreating(false);
      toast({ title: "החשבונית נשמרה בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת החשבונית נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const filtered = (invoices ?? []).filter((inv) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [String(inv.invoice_number), customerNameById.get(inv.customer_id) ?? ""].some((v) =>
      v.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Pinned like every detail page's DetailToolbar — see QuotesPage.tsx
          for the full reasoning. */}
      <DetailToolbar>
        <span className="text-sm font-medium text-muted-foreground">{strings.nav.invoices}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setCreating((v) => !v)}>+ חשבונית חדשה</Button>
        </div>
      </DetailToolbar>
      <PageHeader
        title={strings.nav.invoices}
        description={'רשימת החשבוניות — חיפוש ויצירה. לחיצה על חשבונית פותחת את כל הפרטים שלה. הפקת חשבונית מס רשמית נעשית עדיין דרך "יש חשבונית" בחוץ.'}
        icon={IconReceipt}
        color="bg-emerald-500"
      />

      {creating && (
        <InvoiceForm
          initial={null}
          initialLineItems={[]}
          customers={customers ?? []}
          jobs={jobs ?? []}
          quotes={quotes ?? []}
          priceListItems={priceListItems ?? []}
          submitting={create.isPending}
          error={create.error instanceof Error ? create.error.message : null}
          onCancel={() => setCreating(false)}
          onSubmit={(values) => create.mutate(values)}
        />
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <Input
            placeholder="חיפוש לפי מספר חשבונית או לקוח..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          {isLoading ? (
            <TableSkeleton columns={7} />
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">{strings.common.noResults}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>מס׳</TableHead>
                  <TableHead>לקוח</TableHead>
                  <TableHead>סכום</TableHead>
                  <TableHead>יתרה</TableHead>
                  <TableHead>{strings.common.status}</TableHead>
                  <TableHead>לתשלום עד</TableHead>
                  <TableHead>קישור חיצוני</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => {
                  // Paid / partially paid / overdue are worked out from the
                  // payment ledger and the due date rather than read off a
                  // stored flag, so "באיחור" is true the day it becomes
                  // true — see lib/invoiceStatus.ts.
                  const balance = invoiceBalanceState(inv);
                  return (
                    <TableRow
                      key={inv.id}
                      onClick={() => navigate(`/admin/invoices/${inv.id}`)}
                      className="cursor-pointer"
                    >
                      <TableCell>#{inv.invoice_number}</TableCell>
                      <TableCell className="font-medium">{customerNameById.get(inv.customer_id) ?? "—"}</TableCell>
                      <TableCell>{formatCurrency(inv.amount)}</TableCell>
                      <TableCell className={balance.balance > 0 ? "font-medium" : "text-muted-foreground"}>
                        {balance.balance > 0 ? formatCurrency(balance.balance) : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={balance.badgeStatus} label={balance.label} />
                      </TableCell>
                      <TableCell className={balance.state === "overdue" ? "font-medium text-destructive" : undefined}>
                        {formatDate(inv.due_date ?? inv.issued_date)}
                      </TableCell>
                      <TableCell>{inv.external_url ? "יש קישור" : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface InvoiceFormProps {
  initial: Invoice | null;
  initialLineItems: { price_list_item_id: string | null; description: string; quantity: number; unit_price: number }[];
  customers: Customer[];
  jobs: Job[];
  quotes: Quote[];
  priceListItems: PriceListItem[];
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: InvoiceFormInput) => void;
}

// Exported so InvoiceDetailPage can reuse the exact same fields/validation
// for editing an existing invoice — this list page only ever uses it for
// creating a new one.
export function InvoiceForm({
  initial,
  initialLineItems,
  customers,
  jobs,
  quotes,
  priceListItems,
  submitting,
  error,
  onCancel,
  onSubmit,
}: InvoiceFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<InvoiceFormInput>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      customer_id: initial?.customer_id ?? "",
      job_id: initial?.job_id ?? "",
      quote_id: initial?.quote_id ?? "",
      amount: initial?.amount ?? 0,
      discount: initial?.discount ?? 0,
      discount_type: initial?.discount_type ?? "fixed",
      include_vat: initial?.include_vat ?? false,
      issued_date: initial?.issued_date ?? new Date().toISOString().slice(0, 10),
      due_date: initial?.due_date ?? "",
      allocation_number: initial?.allocation_number ?? "",
      external_provider: initial?.external_provider ?? "",
      external_reference: initial?.external_reference ?? "",
      external_url: initial?.external_url ?? "",
      notes: initial?.notes ?? "",
      status: initial?.status ?? "pending",
      line_items: initialLineItems.map((li) => ({
        price_list_item_id: li.price_list_item_id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
      })),
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "line_items" });
  const lineItems = watch("line_items");
  const discount = watch("discount");
  const discountType = watch("discount_type");
  const includeVat = watch("include_vat");
  const amountField = watch("amount");
  const itemized = fields.length > 0;

  // Same calculation, same rate, as the save path above and the quote form
  // (lib/money.ts + useVatRate) — so what's on screen is what gets stored.
  const { vatRate } = useVatRate();
  const totals = computeDocumentTotals({
    lineItems,
    discount,
    discountType,
    includeVat,
    vatRate,
    fallbackAmount: amountField,
  });

  return (
    <Card>
      <CardContent className="p-4">
        {/* id lets InvoiceDetailPage's fixed DetailToolbar submit this form
            with a `form="invoice-form"` button while editing, so "שמור" is
            reachable without scrolling all the way down here first — same
            pattern as InspectionHeaderForm's sticky bar (see
            ResourceCategoryDetailPage) and QuoteForm's "quote-form". */}
        <form id="invoice-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
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
                  />
                )}
              />
            </FormField>
            {!itemized && (
              <FormField label="סכום (₪)" htmlFor="amount" error={errors.amount?.message}>
                <Input id="amount" type="number" step="0.01" {...register("amount")} />
              </FormField>
            )}
            <FormField label="עבודה מקושרת" htmlFor="job_id" error={errors.job_id?.message}>
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
            <FormField label="הצעת מחיר מקושרת" htmlFor="quote_id" error={errors.quote_id?.message}>
              <Controller
                name="quote_id"
                control={control}
                render={({ field }) => (
                  <Combobox
                    id="quote_id"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    options={quotes.map((q) => ({ value: q.id, label: `#${q.quote_number}` }))}
                    placeholder="בחר/י הצעת מחיר..."
                    emptyOptionLabel="ללא"
                  />
                )}
              />
            </FormField>
            <FormField label="תאריך הפקה" htmlFor="issued_date" error={errors.issued_date?.message}>
              <Input id="issued_date" type="date" {...register("issued_date")} />
            </FormField>
            <FormField label="לתשלום עד" htmlFor="due_date" error={errors.due_date?.message}>
              <Input id="due_date" type="date" {...register("due_date")} />
              <p className="mt-1 text-xs text-muted-foreground">אם ריק — תאריך ההפקה (תשלום מיידי).</p>
            </FormField>
            <FormField
              label="מספר הקצאה"
              htmlFor="allocation_number"
              error={errors.allocation_number?.message}
            >
              <Input id="allocation_number" dir="ltr" {...register("allocation_number")} />
              <p className="mt-1 text-xs text-muted-foreground">
                נדרש בחשבונית מס ללקוח עסקי מעל 5,000 ₪ (לפני מע״מ).
              </p>
            </FormField>
            {initial && (
              <FormField label={strings.common.status} htmlFor="status" error={errors.status?.message}>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <StatusSelect
                      id="status"
                      value={field.value}
                      onChange={field.onChange}
                      options={Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => ({
                        value: value as InvoiceStatus,
                        label,
                      }))}
                    />
                  )}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  &quot;שולם&quot; ו&quot;באיחור&quot; נקבעים מהתשלומים ומתאריך היעד — אין צורך לסמן ידנית.
                </p>
              </FormField>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">פירוט פריטים (אופציונלי)</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ price_list_item_id: null, description: "", quantity: 1, unit_price: 0 })}
              >
                + שורה
              </Button>
            </div>
            {!itemized ? (
              <p className="text-sm text-muted-foreground">
                אין פריטים מפורטים על החשבונית — הסכום למעלה נכנס ידנית. אפשר להוסיף פירוט על ידי &quot;+ שורה&quot;.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  {fields.map((field, index) => (
                    <InvoiceLineItemRow
                      key={field.id}
                      index={index}
                      control={control}
                      register={register}
                      errors={errors}
                      priceListItems={priceListItems}
                      onRemove={() => remove(index)}
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
              </>
            )}
          </div>

          {/* The same discount/VAT block a quote has. Without it an invoice
              could only carry a bare total, which is what let an edit
              recompute that total from pre-VAT rows and drop the tax. */}
          <div className="flex flex-col items-end gap-2 border-t pt-3 text-sm">
            <div className="flex w-full max-w-xs flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="discount">הנחה</Label>
                {discountType === "percent" && totals.discountAmount > 0 && (
                  <span className="text-xs text-muted-foreground">-{formatCurrency(totals.discountAmount)}</span>
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
            </div>

            <label className="flex items-center gap-2 self-end text-sm">
              <input type="checkbox" {...register("include_vat")} className="h-4 w-4" />
              כולל מע״מ ({Math.round(vatRate * 100)}%)
            </label>

            <div className="flex w-48 justify-between">
              <span className="text-muted-foreground">סכום ביניים</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex w-48 justify-between">
                <span className="text-muted-foreground">
                  הנחה{discountType === "percent" ? ` (${Number(discount) || 0}%)` : ""}
                </span>
                <span>-{formatCurrency(totals.discountAmount)}</span>
              </div>
            )}
            {includeVat && (
              <div className="flex w-48 justify-between">
                <span className="text-muted-foreground">מע״מ ({Math.round(vatRate * 100)}%)</span>
                <span>{formatCurrency(totals.taxAmount)}</span>
              </div>
            )}
            <div className="flex w-48 justify-between font-medium">
              <span>{strings.common.total}</span>
              <span>{formatCurrency(totals.total)}</span>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">פרטי חשבונית חיצונית (יש חשבונית וכו׳)</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label="ספק" htmlFor="external_provider" error={errors.external_provider?.message}>
                <Input id="external_provider" placeholder="יש חשבונית" {...register("external_provider")} />
              </FormField>
              <FormField label="מספר אסמכתא" htmlFor="external_reference" error={errors.external_reference?.message}>
                <Input id="external_reference" {...register("external_reference")} />
              </FormField>
              <FormField label="קישור" htmlFor="external_url" error={errors.external_url?.message}>
                <Input id="external_url" type="url" {...register("external_url")} />
              </FormField>
            </div>
          </div>

          <FormField label="הערות" htmlFor="notes" error={errors.notes?.message}>
            <Textarea id="notes" {...register("notes")} />
          </FormField>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {strings.common.save}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              {strings.common.cancel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

interface InvoiceLineItemRowProps {
  index: number;
  control: Control<InvoiceFormInput>;
  register: UseFormRegister<InvoiceFormInput>;
  errors: FieldErrors<InvoiceFormInput>;
  priceListItems: PriceListItem[];
  onRemove: () => void;
  onPickPriceListItem: (itemId: string) => void;
}

function InvoiceLineItemRow({
  index,
  control,
  register,
  errors,
  priceListItems,
  onRemove,
  onPickPriceListItem,
}: InvoiceLineItemRowProps) {
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
        <Input
          id={`line_items.${index}.unit_price`}
          type="number"
          step="0.01"
          {...register(`line_items.${index}.unit_price`)}
        />
      </FormField>
      <div className="sm:col-span-1">
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          הסר
        </Button>
      </div>
    </div>
  );
}
