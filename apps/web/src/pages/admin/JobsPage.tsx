import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { jobSchema, type JobInput, type Job, type JobStatus, type Customer, strings } from "@repo/shared";
import { JOB_STATUS_LABELS } from "@repo/shared";
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
import { IconClipboardCheck } from "../../components/icons";
import { formatDate } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";

// "open" is a grouping, not a real status — it covers every job that isn't
// finished yet (new/scheduled/in_progress), matching how the dashboard's
// "עבודות פתוחות" stat itself is computed (see DashboardPage's openJobs
// query). The dashboard's stat cards link here with `?status=open` /
// `?status=completed` so clicking one lands on the matching filtered list
// instead of just a number.
const OPEN_JOB_STATUSES: JobStatus[] = ["new", "scheduled", "in_progress"];
type JobStatusFilter = "all" | "open" | "completed" | "cancelled";

function isJobStatusFilter(value: string | null): value is JobStatusFilter {
  return value === "open" || value === "completed" || value === "cancelled";
}

export function JobsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = React.useState<Job | "new" | null>(null);
  const [search, setSearch] = React.useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter: JobStatusFilter = isJobStatusFilter(searchParams.get("status")) ? (searchParams.get("status") as JobStatusFilter) : "all";

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

  const filteredJobs = React.useMemo(() => {
    const all = jobs ?? [];
    const byStatus =
      statusFilter === "all"
        ? all
        : statusFilter === "open"
          ? all.filter((j) => OPEN_JOB_STATUSES.includes(j.status))
          : all.filter((j) => j.status === statusFilter);

    // Every other list in the app has a search box; jobs was the exception,
    // which meant finding "the Levi job on Herzl street" was manual scrolling
    // once there were a few hundred of them. Searches the things you'd
    // actually remember about a job: who it was for, what it was, and where.
    const q = search.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((j) =>
      [j.title, j.address, j.description, customerNameById.get(j.customer_id)].some((v) =>
        v?.toLowerCase().includes(q)
      )
    );
  }, [jobs, statusFilter, search, customerNameById]);

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
        // Only written when the caller actually supplied it. JobForm has no
        // quote picker, so on an edit `rest.quote_id` is undefined — and
        // writing `undefined || null` used to null out the link to the quote
        // a job was created from. The job then looked fine, but "צור חשבונית"
        // on it produced an empty ₪0 invoice, because there was no quote left
        // to copy the lines and total from.
        ...(rest.quote_id !== undefined ? { quote_id: rest.quote_id || null } : {}),
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

  // Quick one-click status change from the list, for the most common
  // in-the-field action — no need to open the edit form just to flip a job
  // to completed. jobs_stamp_completed_at (0003) stamps completed_at from
  // this status change automatically, so there's nothing else to set here.
  const markCompleted = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("jobs").update({ status: "completed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "העבודה סומנה כהושלמה", variant: "success" });
    },
    onError: (err) => toast({ title: "עדכון הסטטוס נכשל", description: getErrorMessage(err), variant: "error" }),
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
      // The rest of the quote's money breakdown, carried across with the
      // total so the invoice is a complete document rather than a bare
      // number that loses its VAT the first time it's edited.
      let quoteTotals = {
        subtotal: 0,
        discount: 0,
        discount_type: "fixed" as "fixed" | "percent",
        include_vat: false,
        tax_rate: 0,
        tax_amount: 0,
      };
      let quoteLineItems: { price_list_item_id: string | null; description: string; quantity: number; unit_price: number }[] = [];

      if (job.quote_id) {
        const { data: quote, error: quoteError } = await supabase
          .from("quotes")
          .select("*")
          .eq("id", job.quote_id)
          .single();
        if (quoteError) throw quoteError;
        quoteTotal = quote.total;
        quoteTotals = {
          subtotal: quote.subtotal ?? 0,
          discount: quote.discount ?? 0,
          discount_type: quote.discount_type ?? "fixed",
          include_vat: quote.include_vat ?? false,
          tax_rate: quote.tax_rate ?? 0,
          tax_amount: quote.tax_amount ?? 0,
        };

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
          ...quoteTotals,
          amount: quoteTotal,
          issued_date: new Date().toISOString().slice(0, 10),
          due_date: new Date().toISOString().slice(0, 10),
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
      {/* Pinned like every detail page's DetailToolbar — see QuotesPage.tsx
          for the full reasoning. */}
      <DetailToolbar>
        <span className="text-sm font-medium text-muted-foreground">{strings.nav.jobs}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setEditing((c) => (c === "new" ? null : "new"))}>+ עבודה חדשה</Button>
        </div>
      </DetailToolbar>
      <PageHeader
        title={strings.nav.jobs}
        description="עבודות פתוחות, מתוזמנות וסגורות."
        icon={IconClipboardCheck}
        color="bg-amber-500"
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
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="חיפוש לפי לקוח, כותרת או כתובת..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Label htmlFor="job-status-filter" className="shrink-0 text-sm text-muted-foreground">
              סינון לפי סטטוס
            </Label>
            <StatusSelect
              id="job-status-filter"
              aria-label="סינון לפי סטטוס"
              className="w-48"
              showDot={false}
              value={statusFilter}
              onChange={(next) => setSearchParams(next === "all" ? {} : { status: next }, { replace: true })}
              options={[
                { value: "all" as const, label: "הכל" },
                { value: "open" as const, label: "פתוחות" },
                { value: "completed" as const, label: "הושלמו" },
                { value: "cancelled" as const, label: "בוטלו" },
              ]}
            />
          </div>

          {isLoading ? (
            <TableSkeleton columns={5} />
          ) : filteredJobs.length === 0 ? (
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
                {filteredJobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-medium">
                      <Link to={`/admin/jobs/${j.id}`} className="text-primary hover:underline">
                        {j.title}
                      </Link>
                    </TableCell>
                    <TableCell>{customerNameById.get(j.customer_id) ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={j.status} label={JOB_STATUS_LABELS[j.status] ?? j.status} />
                    </TableCell>
                    <TableCell>{formatDate(j.scheduled_date)}</TableCell>
                    <TableCell>
                      {/* Editing and deleting a job now live on its own detail
                          page (opened by clicking the title above) — these are
                          the two quick actions worth doing without leaving the
                          list: close out a job, or log what was used on it. */}
                      <div className="flex flex-wrap gap-2">
                        {j.status !== "completed" && j.status !== "cancelled" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={markCompleted.isPending}
                            onClick={() => markCompleted.mutate(j.id)}
                          >
                            סיום עבודה
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => navigate(`/admin/jobs/${j.id}?addMaterial=1`)}>
                          הורדת חומר
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

export interface JobFormProps {
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

export function JobForm({ initial, customers, submitting, error, onCancel, onSubmit }: JobFormProps) {
  const {
    register,
    handleSubmit,
    control,
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
        {/* id lets JobDetailPage's fixed DetailToolbar submit this form with
            a `form="job-form"` button while editing, so "שמור" is reachable
            without scrolling all the way down here first — same pattern as
            InspectionHeaderForm's sticky bar (see ResourceCategoryDetailPage)
            and QuoteForm's "quote-form". */}
        <form id="job-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
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
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <StatusSelect
                      id="status"
                      value={field.value as JobStatus}
                      onChange={field.onChange}
                      options={Object.entries(JOB_STATUS_LABELS).map(([value, label]) => ({
                        value: value as JobStatus,
                        label,
                      }))}
                    />
                  )}
                />
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
