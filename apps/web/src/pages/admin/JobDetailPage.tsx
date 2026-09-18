import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  type Job,
  type JobInput,
  type JobStatus,
  type Customer,
  type Expense,
  type Invoice,
  type InventoryItem,
  type InventoryTransaction,
  EXPENSE_CATEGORY_LABELS,
  JOB_STATUS_LABELS,
  recordInventoryTransaction,
  strings,
} from "@repo/shared";
import {
  Button,
  Card,
  CardContent,
  Combobox,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DetailToolbar } from "../../components/DetailToolbar";
import { FormField } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { IconClipboardCheck } from "../../components/icons";
import { formatCurrency, formatDate } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";
// Reused from the list page rather than duplicated — same fields, same
// validation, same "status" field that only shows up when editing an
// existing job.
import { JobForm } from "./JobsPage";

// The "job card" — the page a job row opens into, matching the same
// "compact list → its own detail page" split every other section already
// uses. Jobs were the one part of the app without one, which is why the two
// things that belong to a job and nothing else — the materials taken out of
// stock for it, and what it actually earned — had nowhere to live.
export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = React.useState(false);
  // "הורדת חומר" on the jobs list links straight here with ?addMaterial=1
  // so the form is already open instead of landing on a plain read view the
  // person then has to hunt through. Consumed once, then dropped from the
  // URL so a later refresh doesn't keep popping it back open.
  const [addingMaterial, setAddingMaterial] = React.useState(() => searchParams.get("addMaterial") === "1");
  React.useEffect(() => {
    if (searchParams.get("addMaterial") === "1") {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("addMaterial");
          return next;
        },
        { replace: true }
      );
    }
    // Only ever meant to run once, off the URL this page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: job, isLoading } = useQuery({
    queryKey: ["jobs", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").eq("id", id as string).single();
      if (error) throw error;
      return data as Job;
    },
  });

  const { data: customer } = useQuery({
    queryKey: ["customers", job?.customer_id],
    enabled: !!job?.customer_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", job?.customer_id as string)
        .single();
      if (error) throw error;
      return data as Customer;
    },
  });

  // For the edit form's customer picker — same query every other page uses.
  const { data: customers } = useQuery({
    queryKey: ["customers", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });

  const { data: inventoryItems } = useQuery({
    queryKey: ["inventory_items", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_items").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as InventoryItem[];
    },
  });

  // Materials taken out of stock for this job. Reading the movements rather
  // than a summary keeps the history — including a correction that put
  // something back.
  const { data: materials } = useQuery({
    queryKey: ["inventory_transactions", "job", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_transactions")
        .select("*")
        .eq("job_id", id as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InventoryTransaction[];
    },
  });

  const { data: jobExpenses } = useQuery({
    queryKey: ["expenses", "job", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("job_id", id as string)
        .order("expense_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  const { data: jobInvoices } = useQuery({
    queryKey: ["invoices", "job", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").eq("job_id", id as string);
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });

  const itemById = React.useMemo(() => {
    const map = new Map<string, InventoryItem>();
    (inventoryItems ?? []).forEach((i) => map.set(i.id, i));
    return map;
  }, [inventoryItems]);

  const addMaterial = useMutation({
    mutationFn: async (values: MaterialFormInput) => {
      // Negative delta: using a part on a job takes it out of stock. The
      // RPC writes the movement and adjusts quantity_on_hand together, and
      // captures the item's cost at this moment for job costing.
      await recordInventoryTransaction(supabase, {
        inventoryItemId: values.inventory_item_id,
        jobId: id as string,
        quantityDelta: -Math.abs(values.quantity),
        reason: "job_usage",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory_transactions", "job", id] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      setAddingMaterial(false);
      toast({ title: "החומר נרשם על העבודה", variant: "success" });
    },
    onError: (err) => toast({ title: "רישום החומר נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  const undoMaterial = useMutation({
    mutationFn: async (movement: InventoryTransaction) => {
      // Recorded as an opposite movement rather than a deletion, so the
      // stock level and the history both stay truthful.
      await recordInventoryTransaction(supabase, {
        inventoryItemId: movement.inventory_item_id,
        jobId: id as string,
        quantityDelta: -movement.quantity_delta,
        reason: "adjustment",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory_transactions", "job", id] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      toast({ title: "בוצע תיקון מלאי", variant: "success" });
    },
    onError: (err) => toast({ title: "התיקון נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  // Editing now lives here on the detail page rather than inline in the
  // list — id is always known from the route, so this is update-only.
  const update = useMutation({
    mutationFn: async (values: JobInput & { status?: JobStatus }) => {
      const payload = {
        customer_id: values.customer_id,
        title: values.title,
        description: values.description || null,
        address: values.address || null,
        scheduled_date: values.scheduled_date || null,
        assigned_technician_id: values.assigned_technician_id || null,
        ...(values.quote_id !== undefined ? { quote_id: values.quote_id || null } : {}),
        ...(values.status ? { status: values.status } : {}),
      };
      const { error } = await supabase.from("jobs").update(payload).eq("id", id as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs", id] });
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setEditing(false);
      toast({ title: "העבודה נשמרה בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת העבודה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("jobs").delete().eq("id", id as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "העבודה נמחקה", variant: "success" });
      navigate("/admin/jobs");
    },
    onError: (err) => toast({ title: "מחיקת העבודה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  // What the job earned and what it cost.
  //
  // Revenue is what was actually invoiced, not what was quoted — a quote is
  // an offer, an invoice is the bill. Materials are priced at the cost
  // captured when each part was used. Expenses count net of the VAT that
  // can be reclaimed, because that part comes back and was never really a
  // cost to the business.
  const profit = React.useMemo(() => {
    const revenue = (jobInvoices ?? []).reduce((sum, inv) => sum + Number(inv.amount || 0), 0);

    const materialsCost = (materials ?? []).reduce((sum, m) => {
      const cost = Number(m.unit_cost ?? itemById.get(m.inventory_item_id)?.unit_cost ?? 0);
      // Movements out of stock are negative; their cost is a positive spend.
      return sum + -Number(m.quantity_delta) * cost;
    }, 0);

    const expensesCost = (jobExpenses ?? []).reduce((sum, e) => {
      const reclaimable = Number(e.vat_amount || 0) * Number(e.vat_deductible_rate ?? 1);
      return sum + (Number(e.amount || 0) - reclaimable);
    }, 0);

    const round = (n: number) => Math.round(n * 100) / 100;
    const totalCost = round(materialsCost + expensesCost);
    return {
      revenue: round(revenue),
      materialsCost: round(materialsCost),
      expensesCost: round(expensesCost),
      totalCost,
      margin: round(revenue - totalCost),
      hasRevenue: (jobInvoices ?? []).length > 0,
    };
  }, [jobInvoices, materials, jobExpenses, itemById]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">{strings.common.loading}</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">העבודה לא נמצאה.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <DetailToolbar>
        <Link to="/admin/jobs" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ {strings.common.back} לעבודות
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Pinned Cancel/Save while editing — the form's own buttons sit
              at the bottom of the form, so without this they'd only be
              reachable after scrolling all the way down. Save submits the
              form by id (same pattern as InspectionHeaderForm's sticky
              bar). */}
          {editing && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                {strings.common.cancel}
              </Button>
              <Button type="submit" form="job-form" size="sm" disabled={update.isPending}>
                {strings.common.save}
              </Button>
            </>
          )}
          {!editing && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                {strings.common.edit}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: "מחיקת עבודה",
                    description: `למחוק את העבודה "${job.title}"? הפעולה אינה הפיכה.`,
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

      <PageHeader title={job.title} description="כרטיס עבודה." icon={IconClipboardCheck} color="bg-orange-500" />

      {editing && (
        <JobForm
          initial={job}
          customers={customers ?? []}
          submitting={update.isPending}
          error={update.error instanceof Error ? update.error.message : null}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => update.mutate(values)}
        />
      )}

      {!editing && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <div>
              <StatusBadge status={job.status} label={JOB_STATUS_LABELS[job.status] ?? job.status} />
            </div>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">לקוח</dt>
                <dd className="text-sm font-medium">
                  {customer ? (
                    <Link to={`/admin/customers/${customer.id}`} className="text-primary hover:underline">
                      {customer.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">תאריך מתוזמן</dt>
                <dd className="text-sm font-medium">{formatDate(job.scheduled_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">כתובת</dt>
                <dd className="text-sm font-medium">{job.address ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">הושלמה בתאריך</dt>
                <dd className="text-sm font-medium">{job.completed_at ? formatDate(job.completed_at) : "—"}</dd>
              </div>
            </dl>
            {job.description && (
              <div>
                <p className="text-xs text-muted-foreground">תיאור</p>
                <p className="whitespace-pre-wrap text-sm">{job.description}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Profitability */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">רווחיות</p>
            <p className="text-xs text-muted-foreground">
              הכנסה לפי מה שחויב בפועל בחשבוניות, פחות עלות החומרים וההוצאות ששויכו לעבודה.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">הכנסה</p>
              <p className="text-lg font-semibold">{formatCurrency(profit.revenue)}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">חומרים</p>
              <p className="text-lg font-semibold">{formatCurrency(profit.materialsCost)}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">הוצאות</p>
              <p className="text-lg font-semibold">{formatCurrency(profit.expensesCost)}</p>
            </div>
            <div
              className={
                profit.margin >= 0
                  ? "rounded-md border border-emerald-200 bg-emerald-50/60 p-3"
                  : "rounded-md border border-destructive/30 bg-destructive/10 p-3"
              }
            >
              <p className={profit.margin >= 0 ? "text-xs text-emerald-800" : "text-xs text-destructive"}>נשאר ביד</p>
              <p
                className={
                  profit.margin >= 0 ? "text-lg font-semibold text-emerald-900" : "text-lg font-semibold text-destructive"
                }
              >
                {formatCurrency(profit.margin)}
              </p>
            </div>
          </div>
          {!profit.hasRevenue && (
            <p className="text-xs text-muted-foreground">
              עדיין לא הופקה חשבונית לעבודה הזו, אז ההכנסה מוצגת כאפס.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Materials */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">חומרים שנוצלו</p>
              <p className="text-xs text-muted-foreground">רישום כאן מוריד את הכמות מהמלאי באופן אוטומטי.</p>
            </div>
            <Button size="sm" onClick={() => setAddingMaterial((v) => !v)}>
              {addingMaterial ? strings.common.cancel : "+ רישום חומר"}
            </Button>
          </div>

          {addingMaterial && (
            <MaterialForm
              items={inventoryItems ?? []}
              submitting={addMaterial.isPending}
              error={addMaterial.error instanceof Error ? addMaterial.error.message : null}
              onCancel={() => setAddingMaterial(false)}
              onSubmit={(values) => addMaterial.mutate(values)}
            />
          )}

          {(materials ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">עדיין לא נרשמו חומרים לעבודה הזו.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>פריט</TableHead>
                  <TableHead>כמות</TableHead>
                  <TableHead>עלות ליחידה</TableHead>
                  <TableHead>סה״כ</TableHead>
                  <TableHead>תאריך</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(materials ?? []).map((m) => {
                  const item = itemById.get(m.inventory_item_id);
                  const cost = Number(m.unit_cost ?? item?.unit_cost ?? 0);
                  const used = -Number(m.quantity_delta);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{item?.name ?? "—"}</TableCell>
                      <TableCell>
                        {used > 0 ? used : `החזרה ${Math.abs(used)}`} {item?.unit ?? ""}
                      </TableCell>
                      <TableCell>{cost ? formatCurrency(cost) : "—"}</TableCell>
                      <TableCell>{cost ? formatCurrency(used * cost) : "—"}</TableCell>
                      <TableCell>{formatDate(m.created_at)}</TableCell>
                      <TableCell className="text-end">
                        {used > 0 && (
                          <button
                            type="button"
                            className="text-xs font-medium text-destructive hover:underline"
                            disabled={undoMaterial.isPending}
                            onClick={() => undoMaterial.mutate(m)}
                          >
                            החזרה למלאי
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Linked expenses */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">הוצאות ששויכו לעבודה</p>
            <p className="text-xs text-muted-foreground">משייכים הוצאה לעבודה מתוך עמוד ההוצאות.</p>
          </div>
          {(jobExpenses ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">אין הוצאות משויכות.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ספק</TableHead>
                  <TableHead>תאריך</TableHead>
                  <TableHead>קטגוריה</TableHead>
                  <TableHead>סכום</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(jobExpenses ?? []).map((e) => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/admin/expenses/${e.id}`)}
                  >
                    <TableCell className="font-medium">{e.vendor}</TableCell>
                    <TableCell>{formatDate(e.expense_date)}</TableCell>
                    <TableCell>{EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}</TableCell>
                    <TableCell>{formatCurrency(e.amount)}</TableCell>
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

const materialFormSchema = z.object({
  inventory_item_id: z.string().uuid("יש לבחור פריט"),
  quantity: z.coerce.number().min(0.01, "כמות חייבת להיות גדולה מאפס"),
});
type MaterialFormInput = z.infer<typeof materialFormSchema>;

interface MaterialFormProps {
  items: InventoryItem[];
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: MaterialFormInput) => void;
}

function MaterialForm({ items, submitting, error, onCancel, onSubmit }: MaterialFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<MaterialFormInput>({
    resolver: zodResolver(materialFormSchema),
    defaultValues: { inventory_item_id: "", quantity: 1 },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 rounded-md border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="פריט מהמלאי" htmlFor="inventory_item_id" error={errors.inventory_item_id?.message}>
          <Controller
            name="inventory_item_id"
            control={control}
            render={({ field }) => (
              <Combobox
                id="inventory_item_id"
                value={field.value}
                onChange={field.onChange}
                options={items.map((i) => ({
                  value: i.id,
                  label: i.name,
                  sublabel: `${i.quantity_on_hand} ${i.unit} במלאי`,
                }))}
                placeholder="בחר/י פריט..."
              />
            )}
          />
        </FormField>
        <FormField label="כמות" htmlFor="quantity" error={errors.quantity?.message}>
          <Input id="quantity" type="number" step="0.01" {...register("quantity")} />
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
    <Link to="/admin/jobs" className="text-sm font-medium text-muted-foreground hover:text-foreground">
      ‹ {strings.common.back} לעבודות
    </Link>
  );
}
