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
  DEFAULT_VAT_RATE,
  strings,
} from "@repo/shared";
import {
  Button,
  Card,
  CardContent,
  Combobox,
  Input,
  Label,
  Select,
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
import { StatusBadge } from "../../components/StatusBadge";
import { IconFileText } from "../../components/icons";
import { QuickAddCustomerModal } from "../../components/QuickAddCustomerModal";
import { QuotePreviewModal } from "../../components/QuoteViewModal";
import { QuoteDocumentView, type QuoteDocumentData } from "../../components/QuoteDocumentView";
import { formatCurrency, formatDate } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { useQuoteSharing } from "../../hooks/useQuoteSharing";
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

  const { data: vatRate } = useQuery({
    queryKey: ["app_settings", "vat_rate"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("key", "vat_rate").maybeSingle();
      if (error) throw error;
      return typeof data?.value === "number" ? data.value : DEFAULT_VAT_RATE;
    },
  });

  const customerNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    (customers ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const create = useMutation({
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
      <PageHeader
        title={strings.nav.quotes}
        description="רשימת הצעות המחיר — חיפוש ויצירה. לחיצה על הצעה פותחת את כל הפרטים שלה."
        icon={IconFileText}
        color="bg-sky-500"
        action={<Button onClick={() => setCreating((v) => !v)}>+ הצעה חדשה</Button>}
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
  initialLineItems: { price_list_item_id: string | null; description: string; quantity: number; unit_price: number }[];
  customers: Customer[];
  jobs: Job[];
  priceListItems: PriceListItem[];
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: QuoteFormInput) => void;
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
            }))
          : [{ price_list_item_id: null, description: "", quantity: 1, unit_price: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "line_items" });
  const lineItems = watch("line_items");
  const discount = watch("discount");
  const discountType = watch("discount_type");
  const watchedCustomerId = watch("customer_id");
  const watchedNotes = watch("notes");
  const watchedIssuedDate = watch("issued_date");
  const watchedValidUntil = watch("valid_until");
  const includeVat = watch("include_vat");

  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);

  const subtotal = lineItems.reduce((sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0), 0);
  const discountAmount =
    discountType === "percent" ? (subtotal * (Number(discount) || 0)) / 100 : Number(discount) || 0;
  const taxable = Math.max(0, subtotal - discountAmount);
  const estimatedTax = includeVat ? taxable * DEFAULT_VAT_RATE : 0;
  const estimatedTotal = taxable + estimatedTax;

  const previewData: QuoteDocumentData = {
    quoteNumberLabel: initial ? `#${initial.quote_number}` : "תצוגה מקדימה",
    issuedDate: watchedIssuedDate || null,
    validUntil: watchedValidUntil || null,
    status: (watch("status") as string) ?? "draft",
    customerName: customers.find((c) => c.id === watchedCustomerId)?.name ?? "—",
    customerPhone: customers.find((c) => c.id === watchedCustomerId)?.phone ?? null,
    customerEmail: customers.find((c) => c.id === watchedCustomerId)?.email ?? null,
    customerAddress: customers.find((c) => c.id === watchedCustomerId)?.address ?? null,
    lineItems: lineItems.map((li, i) => ({
      id: String(i),
      description: li.description,
      quantity: Number(li.quantity) || 0,
      unit_price: Number(li.unit_price) || 0,
      line_total: (Number(li.quantity) || 0) * (Number(li.unit_price) || 0),
    })),
    subtotal,
    discount: discountAmount,
    discountType,
    discountPercent: discountType === "percent" ? Number(discount) || 0 : null,
    includeVat: !!includeVat,
    taxRate: DEFAULT_VAT_RATE,
    taxAmount: estimatedTax,
    total: estimatedTotal,
    notes: watchedNotes,
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
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
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
            {initial && (
              <FormField label={strings.common.status} htmlFor="status" error={errors.status?.message}>
                <Select id="status" {...register("status")}>
                  {Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">פירוט שירותים</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ price_list_item_id: null, description: "", quantity: 1, unit_price: 0 })}
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
                <Select {...register("discount_type")} className="w-16 shrink-0" aria-label="סוג הנחה">
                  <option value="fixed">₪</option>
                  <option value="percent">%</option>
                </Select>
              </div>
              {errors.discount?.message && <p className="text-xs text-destructive">{errors.discount.message}</p>}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 border-t pt-3 text-sm">
            <label className="flex items-center gap-2 self-end text-sm">
              <input type="checkbox" {...register("include_vat")} className="h-4 w-4" />
              כולל מע״מ ({Math.round(DEFAULT_VAT_RATE * 100)}%)
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
                <span className="text-muted-foreground">מע״מ ({Math.round(DEFAULT_VAT_RATE * 100)}%)</span>
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

          <FormField label="הערות" htmlFor="notes" error={errors.notes?.message}>
            <Textarea id="notes" {...register("notes")} />
          </FormField>
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
            <Button type="button" variant="outline" onClick={() => setShowPreview(true)}>
              תצוגה מקדימה
            </Button>
            {initial && (
              <>
                <Button type="button" variant="outline" onClick={sharing.shareGeneric} disabled={sharing.busy !== null}>
                  {sharing.busy === "share" ? "משתף..." : "שיתוף"}
                </Button>
                <Button type="button" variant="outline" onClick={sharing.shareEmail} disabled={sharing.busy !== null}>
                  {sharing.busy === "email" ? "משתף..." : "שיתוף במייל"}
                </Button>
                <Button type="button" variant="outline" onClick={sharing.shareWhatsApp} disabled={sharing.busy !== null}>
                  {sharing.busy === "whatsapp" ? "משתף..." : "שיתוף בוואטסאפ"}
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
      {showPreview && <QuotePreviewModal data={previewData} onClose={() => setShowPreview(false)} />}
      {/* Rendered off-screen (not display:none, so it still lays out and can
          be rasterized) purely so the share buttons above have something
          to turn into a PDF, built from the current form values — without
          this the person would have to save and reopen the "view" modal
          just to share. */}
      {initial && (
        <div style={{ position: "fixed", top: 0, left: "-9999px", pointerEvents: "none" }} aria-hidden="true">
          <div ref={sharing.docRef}>
            <QuoteDocumentView data={previewData} />
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
      <div className="sm:col-span-1">
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            הסר
          </Button>
        )}
      </div>
    </div>
  );
}
