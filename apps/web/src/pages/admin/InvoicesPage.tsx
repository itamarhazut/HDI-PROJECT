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
import { IconReceipt } from "../../components/icons";
import { formatCurrency, formatDate } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";

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
      // A flat invoice (no itemized rows) keeps whatever amount was typed
      // in; once there's at least one line item, the total is always
      // derived from the rows instead.
      const amount =
        line_items.length > 0 ? line_items.reduce((sum, li) => sum + li.quantity * li.unit_price, 0) : rest.amount;
      const payload = {
        customer_id: rest.customer_id,
        job_id: rest.job_id || null,
        quote_id: rest.quote_id || null,
        amount,
        issued_date: rest.issued_date || null,
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
      <PageHeader
        title={strings.nav.invoices}
        description={'רשימת החשבוניות — חיפוש ויצירה. לחיצה על חשבונית פותחת את כל הפרטים שלה. הפקת חשבונית מס רשמית נעשית עדיין דרך "יש חשבונית" בחוץ.'}
        icon={IconReceipt}
        color="bg-emerald-500"
        action={<Button onClick={() => setCreating((v) => !v)}>+ חשבונית חדשה</Button>}
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
            <TableSkeleton columns={6} />
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">{strings.common.noResults}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>מס׳</TableHead>
                  <TableHead>לקוח</TableHead>
                  <TableHead>סכום</TableHead>
                  <TableHead>{strings.common.status}</TableHead>
                  <TableHead>הופקה</TableHead>
                  <TableHead>קישור חיצוני</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => (
                  <TableRow
                    key={inv.id}
                    onClick={() => navigate(`/admin/invoices/${inv.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell>#{inv.invoice_number}</TableCell>
                    <TableCell className="font-medium">{customerNameById.get(inv.customer_id) ?? "—"}</TableCell>
                    <TableCell>{formatCurrency(inv.amount)}</TableCell>
                    <TableCell>
                      <StatusBadge status={inv.status} label={INVOICE_STATUS_LABELS[inv.status] ?? inv.status} />
                    </TableCell>
                    <TableCell>{formatDate(inv.issued_date)}</TableCell>
                    <TableCell>{inv.external_url ? "יש קישור" : "—"}</TableCell>
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
      issued_date: initial?.issued_date ?? "",
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
  const itemsTotal = lineItems.reduce((sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0), 0);
  const itemized = fields.length > 0;

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
            {!itemized && (
              <FormField label="סכום (₪)" htmlFor="amount" error={errors.amount?.message}>
                <Input id="amount" type="number" step="0.01" {...register("amount")} />
              </FormField>
            )}
            <FormField label="עבודה מקושרת" htmlFor="job_id" error={errors.job_id?.message}>
              <Select id="job_id" {...register("job_id")}>
                <option value="">ללא</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="הצעת מחיר מקושרת" htmlFor="quote_id" error={errors.quote_id?.message}>
              <Select id="quote_id" {...register("quote_id")}>
                <option value="">ללא</option>
                {quotes.map((q) => (
                  <option key={q.id} value={q.id}>
                    #{q.quote_number}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="תאריך הפקה" htmlFor="issued_date" error={errors.issued_date?.message}>
              <Input id="issued_date" type="date" {...register("issued_date")} />
            </FormField>
            {initial && (
              <FormField label={strings.common.status} htmlFor="status" error={errors.status?.message}>
                <Select id="status" {...register("status")}>
                  {Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
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
                אין פריטים מפורטים על החשבונית — הסכום למעלה נכנס ידנית. אפשר להוסיף פירוט על ידי "+ שורה".
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
                <div className="flex justify-end border-t pt-2 text-sm font-medium">
                  <span className="ms-2 text-muted-foreground">{strings.common.total}:</span>
                  <span>{formatCurrency(itemsTotal)}</span>
                </div>
              </>
            )}
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
