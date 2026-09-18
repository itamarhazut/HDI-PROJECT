import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type Expense,
  type ExpenseInput,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  strings,
} from "@repo/shared";
import { Button, Card, CardContent, useConfirmDialog, useToast } from "@repo/ui";
import { DetailToolbar } from "../../components/DetailToolbar";
import { PageHeader } from "../../components/PageHeader";
import { IconWallet } from "../../components/icons";
import { getErrorMessage } from "../../lib/errors";
import { formatCurrency, formatDate } from "../../lib/format";
import { safeStorageFileName } from "../../lib/storage";
import { supabase } from "../../lib/supabase";
import { ExpenseForm } from "./ExpensesPage";

// The "expense card" you land on after clicking a row in ExpensesPage —
// viewing, editing, downloading the receipt and deleting all happen here
// instead of inline in the list, so opening one expense doesn't also show
// the rest of the list at the same time.
export function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  const { data: jobs } = useQuery({
    queryKey: ["jobs", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").order("title");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: expense, isLoading } = useQuery({
    queryKey: ["expenses", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").eq("id", id as string).single();
      if (error) throw error;
      return data as Expense;
    },
    enabled: !!id,
  });

  const update = useMutation({
    mutationFn: async (input: { values: ExpenseInput; file: File | null }) => {
      const { values, file } = input;
      let receiptPath = expense?.receipt_path ?? null;
      let receiptFileName = expense?.receipt_file_name ?? null;
      if (file) {
        const path = `expenses/${Date.now()}-${safeStorageFileName(file.name)}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        receiptPath = path;
        receiptFileName = file.name;
      }

      const payload = {
        vendor: values.vendor,
        supplier_tax_id: values.supplier_tax_id || null,
        expense_date: values.expense_date,
        amount: values.amount,
        vat_amount: values.vat_amount ?? 0,
        vat_deductible_rate: values.vat_deductible_rate,
        category: values.category,
        payment_method: values.payment_method || null,
        job_id: values.job_id || null,
        customer_id: values.customer_id || null,
        notes: values.notes || null,
        receipt_path: receiptPath,
        receipt_file_name: receiptFileName,
      };
      const { error } = await supabase.from("expenses").update(payload).eq("id", id as string);
      if (error) throw error;

      // Same cleanup as DocumentsPage: swapping in a new receipt used to
      // orphan the old one in the bucket forever. Removed only after the
      // row is saved, so a failed save can't lose the original receipt.
      const previousPath = expense?.receipt_path ?? null;
      if (file && previousPath && previousPath !== receiptPath) {
        await supabase.storage.from("documents").remove([previousPath]);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expenses", id] });
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setEditing(false);
      toast({ title: "ההוצאה נשמרה בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת ההוצאה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (expense?.receipt_path) {
        await supabase.storage.from("documents").remove([expense.receipt_path]);
      }
      const { error } = await supabase.from("expenses").delete().eq("id", id as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: "ההוצאה נמחקה", variant: "success" });
      navigate("/admin/expenses");
    },
    onError: (err) => toast({ title: "מחיקת ההוצאה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const download = async (path: string) => {
    setDownloadError(null);
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60);
    if (error || !data) {
      setDownloadError("שגיאה בפתיחת הקבלה: " + (error?.message ?? "לא נמצאה"));
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">{strings.common.loading}</p>
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">ההוצאה לא נמצאה.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <DetailToolbar>
        <Link to="/admin/expenses" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ {strings.common.back} להוצאות
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
              <Button type="submit" form="expense-form" size="sm" disabled={update.isPending}>
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
                    title: "מחיקת הוצאה",
                    description: `למחוק את ההוצאה "${expense.vendor}"? הפעולה אינה הפיכה.`,
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
      <PageHeader title={expense.vendor} description="פרטי הוצאה." icon={IconWallet} color="bg-rose-500" />

      {downloadError && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{downloadError}</span>
          <button onClick={() => setDownloadError(null)} className="font-medium underline">
            סגירה
          </button>
        </div>
      )}

      {editing ? (
        <ExpenseForm
          jobs={jobs ?? []}
          initial={expense}
          submitting={update.isPending}
          error={update.error instanceof Error ? update.error.message : null}
          onCancel={() => setEditing(false)}
          onSubmit={(values, file) => update.mutate({ values, file })}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">תאריך</dt>
                <dd className="text-sm font-medium">{formatDate(expense.expense_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">סכום כולל מע״מ</dt>
                <dd className="text-sm font-medium">{formatCurrency(expense.amount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">מע״מ בקבלה</dt>
                <dd className="text-sm font-medium">
                  {expense.vat_amount ? formatCurrency(expense.vat_amount) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">מע״מ לקיזוז</dt>
                <dd className="text-sm font-medium">
                  {expense.vat_amount
                    ? `${formatCurrency(
                        Math.round(expense.vat_amount * Number(expense.vat_deductible_rate ?? 1) * 100) / 100
                      )} (${Math.round(Number(expense.vat_deductible_rate ?? 1) * 100)}%)`
                    : "—"}
                </dd>
              </div>
              {expense.supplier_tax_id && (
                <div>
                  <dt className="text-xs text-muted-foreground">ח.פ / עוסק של הספק</dt>
                  <dd className="text-sm font-medium" dir="ltr">
                    {expense.supplier_tax_id}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">קטגוריה</dt>
                <dd className="text-sm font-medium">{EXPENSE_CATEGORY_LABELS[expense.category] ?? expense.category}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">אמצעי תשלום</dt>
                <dd className="text-sm font-medium">
                  {expense.payment_method
                    ? PAYMENT_METHOD_LABELS[expense.payment_method] ?? expense.payment_method
                    : "—"}
                </dd>
              </div>
              {expense.job_id && (
                <div>
                  <dt className="text-xs text-muted-foreground">עבודה מקושרת</dt>
                  <dd className="text-sm font-medium">
                    {(jobs ?? []).find((j) => j.id === expense.job_id)?.title ?? "—"}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">קבלה מצורפת</dt>
                <dd className="text-sm font-medium">
                  {expense.receipt_path ? (
                    <button
                      className="text-primary underline"
                      onClick={() => void download(expense.receipt_path as string)}
                    >
                      {expense.receipt_file_name ?? "הורדה"}
                    </button>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>

            {expense.notes && (
              <div>
                <p className="text-xs text-muted-foreground">הערות</p>
                <p className="whitespace-pre-wrap text-sm">{expense.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/admin/expenses" className="text-sm font-medium text-muted-foreground hover:text-foreground">
      ‹ {strings.common.back} להוצאות
    </Link>
  );
}
