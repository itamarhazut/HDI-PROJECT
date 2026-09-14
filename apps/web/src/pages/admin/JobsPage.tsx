import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { jobSchema, type JobInput, type Job, type JobStatus, type Customer, strings } from "@repo/shared";
import { JOB_STATUS_LABELS } from "@repo/shared";
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
import { IconClipboardCheck } from "../../components/icons";
import { formatDate } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";

export function JobsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = React.useState<Job | "new" | null>(null);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").order("created_at", { ascending: false });
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

  // Just enough of each invoice to know which jobs already have one — so
  // "צור חשבונית" below doesn't offer to create a second invoice for the
  // same completed job by mistake.
  const { data: invoicedJobIds } = useQuery({
    queryKey: ["invoices", "job_ids"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("job_id").not("job_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((row) => row.job_id as string));
    },
  });

  const customerNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    (customers ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const upsert = useMutation({
    mutationFn: async (values: JobInput & { id?: string; status?: JobStatus }) => {
      const { id, status, ...rest } = values;
      const payload = {
        customer_id: rest.customer_id,
        title: rest.title,
        description: rest.description || null,
        address: rest.address || null,
        scheduled_date: rest.scheduled_date || null,
        assigned_technician_id: rest.assigned_technician_id || null,
        quote_id: rest.quote_id || null,
        ...(status ? { status } : {}),
      };
      if (id) {
        const { error } = await supabase.from("jobs").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("jobs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setEditing(null);
      toast({ title: "העבודה נשמרה בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת העבודה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("jobs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "העבודה נמחקה", variant: "success" });
    },
    onError: (err) => toast({ title: "מחיקת העבודה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  // "צור חשבונית" on a completed job — mirrors QuotesPage's convertToJob:
  // create the related record, then just toast and invalidate (no
  // navigation), leaving the new invoice to review/edit on its own page.
  // When the job has a linked quote, that quote's line items are copied
  // over verbatim so the invoice shows the same detailed breakdown the
  // customer already saw, instead of a single flat amount.
  const createInvoiceFromJob = useMutation({
    mutationFn: async (job: Job) => {
      let quoteTotal = 0;
      let quoteLineItems: { price_list_item_id: string | null; description: string; quantity: number; unit_price: number }[] = [];

      if (job.quote_id) {
        const { data: quote, error: quoteError } = await supabase
          .from("quotes")
          .select("*")
          .eq("id", job.quote_id)
          .single();
        if (quoteError) throw quoteError;
        quoteTotal = quote.total;

        const { data: lineItems, error: lineItemsError } = await supabase
          .from("quote_line_items")
          .select("*")
          .eq("quote_id", job.quote_id)
          .order("sort_order");
        if (lineItemsError) throw lineItemsError;
        quoteLineItems = lineItems ?? [];
      }

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          customer_id: job.customer_id,
          job_id: job.id,
          quote_id: job.quote_id ?? null,
          amount: quoteTotal,
          issued_date: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (invoiceError) throw invoiceError;

      if (quoteLineItems.length > 0) {
        const rows = quoteLineItems.map((li, index) => ({
          invoice_id: invoice.id as string,
          price_list_item_id: li.price_list_item_id,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          line_total: li.quantity * li.unit_price,
          sort_order: index,
        }));
        const { error: insError } = await supabase.from("invoice_line_items").insert(rows);
        if (insError) throw insError;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "נוצרה חשבונית מהעבודה", variant: "success" });
    },
    onError: (err) => toast({ title: "יצירת החשבונית נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={strings.nav.jobs}
        description="עבודות פתוחות, מתוזמנות וסגורות."
        icon={IconClipboardCheck}
        color="bg-amber-500"
        action={<Button onClick={() => setEditing((c) => (c === "new" ? null : "new"))}>+ עבודה חדשה</Button>}
      />

      {editing && (
        <JobForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          customers={customers ?? []}
          submitting={upsert.isPending}
          error={upsert.error instanceof Error ? upsert.error.message : null}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => upsert.mutate(editing === "new" ? values : { ...values, id: editing.id })}
        />
      )}

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <TableSkeleton columns={5} />
          ) : (jobs ?? []).length === 0 ? (
            <p className="text-muted-foreground">{strings.common.noResults}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>כותרת</TableHead>
                  <TableHead>לקוח</TableHead>
                  <TableHead>{strings.common.status}</TableHead>
                  <TableHead>תאריך מתוזמן</TableHead>
                  <TableHead>{strings.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(jobs ?? []).map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-medium">{j.title}</TableCell>
                    <TableCell>{customerNameById.get(j.customer_id) ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={j.status} label={JOB_STATUS_LABELS[j.status] ?? j.status} />
                    </TableCell>
                    <TableCell>{formatDate(j.scheduled_date)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(j)}>
                          {strings.common.edit}
                        </Button>
                        {j.status === "completed" &&
                          (invoicedJobIds?.has(j.id) ? (
                            <span className="self-center text-xs font-medium text-muted-foreground">יש חשבונית ✓</span>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={createInvoiceFromJob.isPending}
                              onClick={() => createInvoiceFromJob.mutate(j)}
                            >
                              צור חשבונית
                            </Button>
                          ))}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: "מחיקת עבודה",
                              description: `למחוק את העבודה "${j.title}"? הפעולה אינה הפיכה.`,
                              confirmLabel: "מחק",
                              variant: "destructive",
                            });
                            if (ok) remove.mutate(j.id);
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

interface JobFormProps {
  initial: Job | null;
  customers: Customer[];
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: JobInput & { status?: JobStatus }) => void;
}

const jobFormSchema = jobSchema.extend({
  status: z.enum(["new", "scheduled", "in_progress", "completed", "cancelled"]).optional(),
});
type JobFormInput = z.infer<typeof jobFormSchema>;

function JobForm({ initial, customers, submitting, error, onCancel, onSubmit }: JobFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<JobFormInput>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: {
      customer_id: initial?.customer_id ?? "",
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      address: initial?.address ?? "",
      scheduled_date: initial?.scheduled_date ?? "",
      assigned_technician_id: initial?.assigned_technician_id ?? "",
      status: initial?.status ?? "new",
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
            <FormField label="כותרת העבודה" htmlFor="title" error={errors.title?.message}>
              <Input id="title" {...register("title")} />
            </FormField>
            <FormField label="כתובת" htmlFor="address" error={errors.address?.message}>
              <Input id="address" {...register("address")} />
            </FormField>
            <FormField label="תאריך מתוזמן" htmlFor="scheduled_date" error={errors.scheduled_date?.message}>
              <Input id="scheduled_date" type="date" {...register("scheduled_date")} />
            </FormField>
            {initial && (
              <FormField label={strings.common.status} htmlFor="status" error={errors.status?.message}>
                <Select id="status" {...register("status")}>
                  {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>
          <FormField label="תיאור" htmlFor="description" error={errors.description?.message}>
            <Textarea id="description" {...register("description")} />
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
