import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  invoiceSchema,
  type Invoice,
  type Customer,
  type Job,
  type Quote,
  INVOICE_STATUS_LABELS,
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
import { IconReceipt } from "../../components/icons";
import { formatCurrency, formatDate } from "../../lib/format";
import { supabase } from "../../lib/supabase";

const invoiceFormSchema = invoiceSchema.extend({
  status: z.enum(["pending", "marked_invoiced", "paid", "overdue", "cancelled"]).optional(),
});
type InvoiceFormInput = z.infer<typeof invoiceFormSchema>;

export function InvoicesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = React.useState<Invoice | "new" | null>(null);

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

  const customerNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    (customers ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const upsert = useMutation({
    mutationFn: async (values: InvoiceFormInput & { id?: string }) => {
      const { id, status, ...rest } = values;
      const payload = {
        customer_id: rest.customer_id,
        job_id: rest.job_id || null,
        quote_id: rest.quote_id || null,
        amount: rest.amount,
        issued_date: rest.issued_date || null,
        external_provider: rest.external_provider || null,
        external_reference: rest.external_reference || null,
        external_url: rest.external_url || null,
        notes: rest.notes || null,
        ...(status ? { status } : {}),
      };
      if (id) {
        const { error } = await supabase.from("invoices").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("invoices").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setEditing(null);
      toast({ title: "החשבונית נשמרה בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת החשבונית נכשלה", description: err instanceof Error ? err.message : undefined, variant: "error" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "החשבונית נמחקה", variant: "success" });
    },
    onError: (err) => toast({ title: "מחיקת החשבונית נכשלה", description: err instanceof Error ? err.message : undefined, variant: "error" }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={strings.nav.invoices}
        description={'מעקב פנימי אחר חשבוניות. הפקת חשבונית מס רשמית נעשית עדיין דרך "יש חשבונית" בחוץ — כאן שומרים קישור וסטטוס.'}
        icon={IconReceipt}
        color="bg-emerald-500"
        action={<Button onClick={() => setEditing((c) => (c === "new" ? null : "new"))}>+ חשבונית חדשה</Button>}
      />

      {editing && (
        <InvoiceForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          customers={customers ?? []}
          jobs={jobs ?? []}
          quotes={quotes ?? []}
          submitting={upsert.isPending}
          error={upsert.error instanceof Error ? upsert.error.message : null}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => upsert.mutate(editing === "new" ? values : { ...values, id: editing.id })}
        />
      )}

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <TableSkeleton columns={7} />
          ) : (invoices ?? []).length === 0 ? (
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
                  <TableHead>{strings.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invoices ?? []).map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>#{inv.invoice_number}</TableCell>
                    <TableCell className="font-medium">{customerNameById.get(inv.customer_id) ?? "—"}</TableCell>
                    <TableCell>{formatCurrency(inv.amount)}</TableCell>
                    <TableCell>
                      <StatusBadge status={inv.status} label={INVOICE_STATUS_LABELS[inv.status] ?? inv.status} />
                    </TableCell>
                    <TableCell>{formatDate(inv.issued_date)}</TableCell>
                    <TableCell>
                      {inv.external_url ? (
                        <a
                          href={inv.external_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline"
                        >
                          פתיחה
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(inv)}>
                          {strings.common.edit}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: "מחיקת חשבונית",
                              description: `למחוק את חשבונית #${inv.invoice_number}? הפעולה אינה הפיכה.`,
                              confirmLabel: "מחק",
                              variant: "destructive",
                            });
                            if (ok) remove.mutate(inv.id);
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

interface InvoiceFormProps {
  initial: Invoice | null;
  customers: Customer[];
  jobs: Job[];
  quotes: Quote[];
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: InvoiceFormInput) => void;
}

function InvoiceForm({ initial, customers, jobs, quotes, submitting, error, onCancel, onSubmit }: InvoiceFormProps) {
  const {
    register,
    handleSubmit,
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
    },
  });

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
            <FormField label="סכום (₪)" htmlFor="amount" error={errors.amount?.message}>
              <Input id="amount" type="number" step="0.01" {...register("amount")} />
            </FormField>
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
