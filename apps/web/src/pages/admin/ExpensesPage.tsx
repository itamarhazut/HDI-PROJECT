import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  expenseSchema,
  type Expense,
  type ExpenseInput,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_PAYMENT_METHOD_LABELS,
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
  useToast,
} from "@repo/ui";
import { FormField } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { IconWallet } from "../../components/icons";
import { formatCurrency, formatDate } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { safeStorageFileName } from "../../lib/storage";
import { supabase } from "../../lib/supabase";

// The list itself only browses/creates/searches — every row is a compact
// link into its own page (ExpenseDetailPage), which is where viewing an
// expense's full details, editing it and deleting it actually happens.
// Same "compact list → its own detail page" split as CustomersPage /
// CustomerDetailPage, so clicking an expense doesn't have to share screen
// space with the rest of the list.
export function ExpensesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const { data: expenses, isLoading } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalThisMonth = React.useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return (expenses ?? [])
      .filter((e) => e.expense_date?.slice(0, 7) === monthKey)
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const create = useMutation({
    mutationFn: async (input: { values: ExpenseInput; file: File | null }) => {
      const { values, file } = input;
      let receiptPath: string | null = null;
      let receiptFileName: string | null = null;
      if (file) {
        const path = `expenses/${Date.now()}-${safeStorageFileName(file.name)}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        receiptPath = path;
        receiptFileName = file.name;
      }

      const payload = {
        vendor: values.vendor,
        expense_date: values.expense_date,
        amount: values.amount,
        category: values.category,
        payment_method: values.payment_method || null,
        notes: values.notes || null,
        receipt_path: receiptPath,
        receipt_file_name: receiptFileName,
      };
      const { error } = await supabase.from("expenses").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setCreating(false);
      toast({ title: "ההוצאה נשמרה בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת ההוצאה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const filtered = (expenses ?? []).filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [e.vendor, EXPENSE_CATEGORY_LABELS[e.category] ?? e.category].some((v) => v?.toLowerCase().includes(q));
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={strings.nav.expenses}
        description="רשימת ההוצאות העסקיות — חיפוש ויצירה. לחיצה על הוצאה פותחת את כל הפרטים שלה."
        icon={IconWallet}
        color="bg-rose-500"
        action={<Button onClick={() => setCreating((v) => !v)}>+ הוצאה חדשה</Button>}
      />

      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <span className="text-sm text-muted-foreground">סה״כ הוצאות החודש</span>
          <span className="text-lg font-semibold">{formatCurrency(totalThisMonth)}</span>
        </CardContent>
      </Card>

      {creating && (
        <ExpenseForm
          initial={null}
          submitting={create.isPending}
          error={create.error instanceof Error ? create.error.message : null}
          onCancel={() => setCreating(false)}
          onSubmit={(values, file) => create.mutate({ values, file })}
        />
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <Input
            placeholder="חיפוש לפי ספק או קטגוריה..."
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
                  <TableHead>ספק</TableHead>
                  <TableHead>תאריך</TableHead>
                  <TableHead>סכום</TableHead>
                  <TableHead>קטגוריה</TableHead>
                  <TableHead>אמצעי תשלום</TableHead>
                  <TableHead>קבלה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((expense) => (
                  <TableRow
                    key={expense.id}
                    onClick={() => navigate(`/admin/expenses/${expense.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">{expense.vendor}</TableCell>
                    <TableCell>{formatDate(expense.expense_date)}</TableCell>
                    <TableCell>{formatCurrency(expense.amount)}</TableCell>
                    <TableCell>{EXPENSE_CATEGORY_LABELS[expense.category] ?? expense.category}</TableCell>
                    <TableCell>
                      {expense.payment_method
                        ? EXPENSE_PAYMENT_METHOD_LABELS[expense.payment_method] ?? expense.payment_method
                        : "—"}
                    </TableCell>
                    <TableCell>{expense.receipt_path ? "יש קבלה" : "—"}</TableCell>
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

interface ExpenseFormProps {
  initial: Expense | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: ExpenseInput, file: File | null) => void;
}

// Exported so ExpenseDetailPage can reuse the exact same fields/validation
// for editing an existing expense — this list page only ever uses it for
// creating a new one.
export function ExpenseForm({ initial, submitting, error, onCancel, onSubmit }: ExpenseFormProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      vendor: initial?.vendor ?? "",
      expense_date: initial?.expense_date ?? new Date().toISOString().slice(0, 10),
      amount: initial?.amount ?? 0,
      category: initial?.category ?? "other",
      payment_method: initial?.payment_method ?? "",
      notes: initial?.notes ?? "",
    },
  });

  const submit = (values: ExpenseInput) => {
    const file = fileInputRef.current?.files?.[0] ?? null;
    onSubmit(values, file);
  };

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="ספק / בית עסק" htmlFor="vendor" error={errors.vendor?.message}>
              <Input id="vendor" {...register("vendor")} />
            </FormField>
            <FormField label="תאריך" htmlFor="expense_date" error={errors.expense_date?.message}>
              <Input id="expense_date" type="date" {...register("expense_date")} />
            </FormField>
            <FormField label="סכום (₪)" htmlFor="amount" error={errors.amount?.message}>
              <Input id="amount" type="number" step="0.01" {...register("amount")} />
            </FormField>
            <FormField label="קטגוריה" htmlFor="category" error={errors.category?.message}>
              <Select id="category" {...register("category")}>
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="אמצעי תשלום" htmlFor="payment_method" error={errors.payment_method?.message}>
              <Select id="payment_method" {...register("payment_method")}>
                <option value="">ללא</option>
                {Object.entries(EXPENSE_PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField label="קבלה מצורפת" htmlFor="receipt">
            <input ref={fileInputRef} id="receipt" type="file" className="text-sm" />
            {initial?.receipt_path && (
              <p className="mt-1 text-xs text-muted-foreground">קיימת כבר קבלה מצורפת — בחירת קובץ חדש תחליף אותה.</p>
            )}
          </FormField>

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
