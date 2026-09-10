import * as React from "react";
import { Link } from "react-router-dom";
import { useFieldArray, useForm, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Textarea,
  useConfirmDialog,
  useToast,
} from "@repo/ui";
import { FormField } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { IconFileText } from "../../components/icons";
import { formatCurrency, formatDate } from "../../lib/format";
import { supabase } from "../../lib/supabase";

const quoteFormSchema = quoteSchema.extend({
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]).optional(),
});
type QuoteFormInput = z.infer<typeof quoteFormSchema>;

export function QuotesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [editingId, setEditingId] = React.useState<string | "new" | null>(null);

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

  const { data: editingLineItems, isFetching: loadingLineItems } = useQuery({
    queryKey: ["quote_line_items", editingId],
    enabled: typeof editingId === "string" && editingId !== "new",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_line_items")
        .select("*")
        .eq("quote_id", editingId as string)
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

  const saveQuote = useMutation({
    mutationFn: async (values: QuoteFormInput & { id?: string }) => {
      const rate = vatRate ?? DEFAULT_VAT_RATE;
      const subtotal = values.line_items.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
      const taxable = Math.max(0, subtotal - values.discount);
      const taxAmount = taxable * rate;
      const total = taxable + taxAmount;

      const quotePayload = {
        customer_id: values.customer_id,
        job_id: values.job_id || null,
        valid_until: values.valid_until || null,
        discount: values.discount,
        notes: values.notes || null,
        subtotal,
        tax_rate: rate,
        tax_amount: taxAmount,
        total,
        ...(values.status ? { status: values.status } : {}),
      };

      let quoteId = values.id;
      if (quoteId) {
        const { error } = await supabase.from("quotes").update(quotePayload).eq("id", quoteId);
        if (error) throw error;
        const { error: delError } = await supabase.from("quote_line_items").delete().eq("quote_id", quoteId);
        if (delError) throw delError;
      } else {
        const { data, error } = await supabase.from("quotes").insert(quotePayload).select("id").single();
        if (error) throw error;
        quoteId = data.id;
      }

      const lineItemRows = values.line_items.map((li, index) => ({
        quote_id: quoteId as string,
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
      void queryClient.invalidateQueries({ queryKey: ["quote_line_items"] });
      setEditingId(null);
      toast({ title: "הצעת המחיר נשמרה בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת הצעת המחיר נכשלה", description: err instanceof Error ? err.message : undefined, variant: "error" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({ title: "הצעת המחיר נמחקה", variant: "success" });
    },
    onError: (err) => toast({ title: "מחיקת הצעת המחיר נכשלה", description: err instanceof Error ? err.message : undefined, variant: "error" }),
  });

  const convertToJob = useMutation({
    mutationFn: async (quote: Quote) => {
      const { error } = await supabase.from("jobs").insert({
        customer_id: quote.customer_id,
        quote_id: quote.id,
        title: `עבודה עבור הצעת מחיר #${quote.quote_number}`,
        status: "new",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "נוצרה עבודה חדשה מהצעת המחיר", variant: "success" });
    },
    onError: (err) => toast({ title: "יצירת העבודה נכשלה", description: err instanceof Error ? err.message : undefined, variant: "error" }),
  });

  const editingQuote = editingId && editingId !== "new" ? (quotes ?? []).find((q) => q.id === editingId) ?? null : null;
  const formReady = editingId === "new" || (editingId !== null && !loadingLineItems);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={strings.nav.quotes}
        description="בניית הצעות מחיר מהמחירון, מעקב סטטוס והפיכה לעבודה."
        icon={IconFileText}
        color="bg-sky-500"
        action={<Button onClick={() => setEditingId((c) => (c === "new" ? null : "new"))}>+ הצעה חדשה</Button>}
      />

      {editingId && formReady && (
        <QuoteForm
          key={editingId}
          initial={editingQuote}
          initialLineItems={editingLineItems ?? []}
          customers={customers ?? []}
          jobs={jobs ?? []}
          priceListItems={priceListItems ?? []}
          submitting={saveQuote.isPending}
          error={saveQuote.error instanceof Error ? saveQuote.error.message : null}
          onCancel={() => setEditingId(null)}
          onSubmit={(values) => saveQuote.mutate(editingQuote ? { ...values, id: editingQuote.id } : values)}
        />
      )}
      {editingId && !formReady && (
        <Card>
          <CardContent className="p-4 text-muted-foreground">{strings.common.loading}</CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <TableSkeleton columns={6} />
          ) : (quotes ?? []).length === 0 ? (
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
                  <TableHead>{strings.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(quotes ?? []).map((q) => (
                  <TableRow key={q.id}>
                    <TableCell>#{q.quote_number}</TableCell>
                    <TableCell className="font-medium">{customerNameById.get(q.customer_id) ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={q.status} label={QUOTE_STATUS_LABELS[q.status] ?? q.status} />
                    </TableCell>
                    <TableCell>{formatCurrency(q.total)}</TableCell>
                    <TableCell>{formatDate(q.issued_date)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingId(q.id)}>
                          {strings.common.edit}
                        </Button>
                        <Link to={`/admin/quotes/${q.id}/print`} target="_blank" rel="noreferrer">
                          <Button variant="outline" size="sm">
                            PDF / הדפסה
                          </Button>
                        </Link>
                        {q.status === "accepted" && (
                          <Button variant="secondary" size="sm" onClick={() => convertToJob.mutate(q)}>
                            הפוך לעבודה
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: "מחיקת הצעת מחיר",
                              description: `למחוק את הצעת המחיר #${q.quote_number}? הפעולה אינה הפיכה.`,
                              confirmLabel: "מחק",
                              variant: "destructive",
                            });
                            if (ok) remove.mutate(q.id);
                          }}
                        >
                          {strings.common.delete}
                        </Button>
                      </div>
                    </TableCell>
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

function QuoteForm({
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
      valid_until: initial?.valid_until ?? "",
      discount: initial?.discount ?? 0,
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

  const subtotal = lineItems.reduce((sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0), 0);
  const taxable = Math.max(0, subtotal - (Number(discount) || 0));
  const estimatedTax = taxable * DEFAULT_VAT_RATE;
  const estimatedTotal = taxable + estimatedTax;

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="לקוח" htmlFor="customer_id" error={errors.customer_id?.message}>
              <Select id="customer_id" {...register("customer_id")}>
                <option value="">בחר/י לקוח...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="עבודה מקושרת (אופציונלי)" htmlFor="job_id" error={errors.job_id?.message}>
              <Select id="job_id" {...register("job_id")}>
                <option value="">ללא</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="בתוקף עד" htmlFor="valid_until" error={errors.valid_until?.message}>
              <Input id="valid_until" type="date" {...register("valid_until")} />
            </FormField>
            <FormField label="הנחה (₪)" htmlFor="discount" error={errors.discount?.message}>
              <Input id="discount" type="number" step="0.01" {...register("discount")} />
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
              <p className="text-sm font-medium">שורות הצעת המחיר</p>
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

          <div className="flex flex-col items-end gap-1 border-t pt-3 text-sm">
            <div className="flex w-48 justify-between">
              <span className="text-muted-foreground">סה״כ לפני מע״מ</span>
              <span>{formatCurrency(taxable)}</span>
            </div>
            <div className="flex w-48 justify-between">
              <span className="text-muted-foreground">מע״מ ({Math.round(DEFAULT_VAT_RATE * 100)}%)</span>
              <span>{formatCurrency(estimatedTax)}</span>
            </div>
            <div className="flex w-48 justify-between font-medium">
              <span>{strings.common.total}</span>
              <span>{formatCurrency(estimatedTotal)}</span>
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

interface LineItemRowProps {
  index: number;
  control: Control<QuoteFormInput>;
  register: UseFormRegister<QuoteFormInput>;
  errors: FieldErrors<QuoteFormInput>;
  priceListItems: PriceListItem[];
  onRemove?: () => void;
  onPickPriceListItem: (itemId: string) => void;
}

function LineItemRow({ index, register, errors, priceListItems, onRemove, onPickPriceListItem }: LineItemRowProps) {
  const lineErrors = errors.line_items?.[index];
  return (
    <div className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-12 sm:items-end">
      <FormField label="מהמחירון" htmlFor={`line_items.${index}.price_list_item_id`} className="sm:col-span-3 flex flex-col gap-1.5">
        <Select
          id={`line_items.${index}.price_list_item_id`}
          {...register(`line_items.${index}.price_list_item_id`)}
          onChange={(e) => onPickPriceListItem(e.target.value)}
        >
          <option value="">בחירה ידנית</option>
          {priceListItems.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </FormField>
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
