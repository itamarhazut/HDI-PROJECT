import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { invoiceSchema, type Invoice, INVOICE_STATUS_LABELS, strings } from "@repo/shared";
import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useConfirmDialog,
  useToast,
} from "@repo/ui";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { IconReceipt } from "../../components/icons";
import { getErrorMessage } from "../../lib/errors";
import { formatCurrency, formatDate } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { InvoiceForm } from "./InvoicesPage";

const invoiceFormSchema = invoiceSchema.extend({
  status: z.enum(["pending", "marked_invoiced", "paid", "overdue", "cancelled"]).optional(),
});
type InvoiceFormInput = z.infer<typeof invoiceFormSchema>;

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

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
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
            <div className="flex items-center justify-between">
              <StatusBadge status={invoice.status} label={INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status} />
              <span className="text-lg font-semibold">{formatCurrency(invoice.amount)}</span>
            </div>

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

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                {strings.common.edit}
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
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/admin/quotes?tab=invoices" className="text-sm font-medium text-muted-foreground hover:text-foreground">
      ‹ {strings.common.back} לחשבוניות
    </Link>
  );
}
