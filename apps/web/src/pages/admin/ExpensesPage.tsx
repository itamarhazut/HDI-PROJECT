import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  expenseSchema,
  type Expense,
  type ExpenseInput,
  type Job,
  type ExpenseCategory,
  type PaymentMethod,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  strings,
} from "@repo/shared";
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
import { StatusSelect } from "../../components/StatusSelect";
import { IconWallet } from "../../components/icons";
import { formatCurrency, formatDate } from "../../lib/format";
import { downloadXlsx, type XlsxColumn } from "../../lib/xlsx";
import { vatPeriodRange, VAT_PERIOD_PRESET_LABELS, type VatPeriodPresetId } from "../../lib/vatPeriod";
import { getErrorMessage } from "../../lib/errors";
import { safeStorageFileName } from "../../lib/storage";
import { supabase } from "../../lib/supabase";
import { useVatRate, useVehicleVatDeductibleRate } from "../../hooks/useVatRate";

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

  const { data: jobs } = useQuery({
    queryKey: ["jobs", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").order("title");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Everything on this page is scoped to a reporting period rather than to
  // "this calendar month", because the question being asked of it is "what
  // do I hand in for this VAT period" — which in Israel is normally two
  // months, not one.
  const [preset, setPreset] = React.useState<VatPeriodPresetId>("this_bimonthly");
  const [customFrom, setCustomFrom] = React.useState("");
  const [customTo, setCustomTo] = React.useState("");

  const range = React.useMemo(() => {
    if (preset === "custom") {
      if (!customFrom || !customTo) return null;
      return { from: customFrom, to: customTo, label: `${customFrom} – ${customTo}` };
    }
    return vatPeriodRange(preset);
  }, [preset, customFrom, customTo]);

  const inPeriod = React.useMemo(() => {
    const all = expenses ?? [];
    if (!range) return all;
    // Plain string comparison is safe and timezone-proof here: both sides
    // are "YYYY-MM-DD", which sorts lexicographically the same way it sorts
    // chronologically.
    return all.filter((e) => e.expense_date >= range.from && e.expense_date <= range.to);
  }, [expenses, range]);

  const summary = React.useMemo(() => {
    let gross = 0;
    let vat = 0;
    let deductibleVat = 0;
    const byCategory = new Map<string, number>();

    for (const e of inPeriod) {
      const amount = Number(e.amount) || 0;
      const expenseVat = Number(e.vat_amount) || 0;
      gross += amount;
      vat += expenseVat;
      deductibleVat += expenseVat * (Number(e.vat_deductible_rate ?? 1) || 0);
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + amount);
    }

    return {
      gross: Math.round(gross * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      deductibleVat: Math.round(deductibleVat * 100) / 100,
      net: Math.round((gross - vat) * 100) / 100,
      count: inPeriod.length,
      byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [inPeriod]);

  // Columns are declared with their type and width so the file opens ready
  // to read: dates as real dates, amounts as real numbers, and nothing
  // showing "#####" because a column was left at Excel's default width.
  const exportColumns: XlsxColumn[] = [
    { header: "תאריך", width: 12, type: "date" },
    { header: "ספק", width: 26, type: "text" },
    { header: "ח.פ / עוסק", width: 14, type: "text" },
    { header: "קטגוריה", width: 20, type: "text" },
    { header: "אמצעי תשלום", width: 16, type: "text" },
    { header: "סכום לפני מע״מ", width: 16, type: "currency" },
    { header: "מע״מ", width: 12, type: "currency" },
    { header: "סכום כולל מע״מ", width: 16, type: "currency" },
    { header: "% מוכר", width: 10, type: "text" },
    { header: "מע״מ לקיזוז", width: 14, type: "currency" },
    { header: "קבלה", width: 8, type: "text" },
    { header: "הערות", width: 34, type: "text" },
  ];

  const exportToExcel = () => {
    const rows = inPeriod
      .slice()
      .sort((a, b) => a.expense_date.localeCompare(b.expense_date))
      .map((e) => {
        const vat = Number(e.vat_amount) || 0;
        const rate = Number(e.vat_deductible_rate ?? 1) || 0;
        return [
          e.expense_date,
          e.vendor,
          e.supplier_tax_id ?? "",
          EXPENSE_CATEGORY_LABELS[e.category] ?? e.category,
          e.payment_method ? PAYMENT_METHOD_LABELS[e.payment_method] ?? e.payment_method : "",
          Math.round((e.amount - vat) * 100) / 100,
          vat,
          Number(e.amount),
          `${Math.round(rate * 100)}%`,
          Math.round(vat * rate * 100) / 100,
          e.receipt_path ? "כן" : "לא",
          e.notes ?? "",
        ];
      });

    void downloadXlsx(`הוצאות ${range?.label ?? "הכל"}`, exportColumns, rows);
  };

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

  const filtered = inPeriod.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [e.vendor, e.supplier_tax_id, e.notes, EXPENSE_CATEGORY_LABELS[e.category] ?? e.category].some((v) =>
      v?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Pinned like every detail page's DetailToolbar — see QuotesPage.tsx
          for the full reasoning. */}
      <DetailToolbar>
        <span className="text-sm font-medium text-muted-foreground">{strings.nav.expenses}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setCreating((v) => !v)}>+ הוצאה חדשה</Button>
        </div>
      </DetailToolbar>
      <PageHeader
        title={strings.nav.expenses}
        description="רשימת ההוצאות העסקיות — חיפוש ויצירה. לחיצה על הוצאה פותחת את כל הפרטים שלה."
        icon={IconWallet}
        color="bg-rose-500"
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="period">תקופת דיווח</Label>
              <StatusSelect
                id="period"
                showDot={false}
                className="w-56"
                value={preset}
                onChange={(next) => setPreset(next)}
                options={Object.entries(VAT_PERIOD_PRESET_LABELS).map(([value, label]) => ({
                  value: value as VatPeriodPresetId,
                  label,
                }))}
              />
            </div>
            {preset === "custom" && (
              <>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="from">מתאריך</Label>
                  <Input id="from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="to">עד תאריך</Label>
                  <Input id="to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </div>
              </>
            )}
            <Button type="button" variant="outline" onClick={exportToExcel} disabled={summary.count === 0}>
              ייצוא לאקסל
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">סה״כ כולל מע״מ</p>
              <p className="text-lg font-semibold">{formatCurrency(summary.gross)}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">לפני מע״מ</p>
              <p className="text-lg font-semibold">{formatCurrency(summary.net)}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">מע״מ בקבלות</p>
              <p className="text-lg font-semibold">{formatCurrency(summary.vat)}</p>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="text-xs text-emerald-800">מע״מ לקיזוז</p>
              <p className="text-lg font-semibold text-emerald-900">{formatCurrency(summary.deductibleVat)}</p>
            </div>
          </div>

          {summary.byCategory.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {summary.byCategory.map(([category, total]) => (
                <span
                  key={category}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                >
                  {EXPENSE_CATEGORY_LABELS[category] ?? category}: {formatCurrency(total)}
                </span>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {range ? `${range.label} · ${summary.count} הוצאות` : "יש לבחור טווח תאריכים"} · הסכומים לפי מה שהוזן
            בכל הוצאה. כדאי לאשר עם רואה החשבון מה מוכר לקיזוז בפועל.
          </p>
        </CardContent>
      </Card>

      {creating && (
        <ExpenseForm
          initial={null}
          jobs={jobs ?? []}
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
                  <TableHead>מע״מ</TableHead>
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
                    <TableCell className="text-muted-foreground">
                      {expense.vat_amount ? formatCurrency(expense.vat_amount) : "—"}
                      {expense.vat_amount > 0 && Number(expense.vat_deductible_rate ?? 1) < 1 && (
                        <span className="text-xs"> ({Math.round(Number(expense.vat_deductible_rate) * 100)}%)</span>
                      )}
                    </TableCell>
                    <TableCell>{EXPENSE_CATEGORY_LABELS[expense.category] ?? expense.category}</TableCell>
                    <TableCell>
                      {expense.payment_method
                        ? PAYMENT_METHOD_LABELS[expense.payment_method] ?? expense.payment_method
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
  /** For attaching the expense to the job it was spent on. */
  jobs?: Job[];
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: ExpenseInput, file: File | null) => void;
}

// Exported so ExpenseDetailPage can reuse the exact same fields/validation
// for editing an existing expense — this list page only ever uses it for
// creating a new one.
export function ExpenseForm({ initial, jobs = [], submitting, error, onCancel, onSubmit }: ExpenseFormProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // Same styled-button-over-a-hidden-native-input treatment as
  // DocumentsPage's file field — the native <input type="file"> renders as
  // the browser's own square, unstyled button. Kept in the DOM (hidden, not
  // removed) so the existing fileInputRef-based "read the file at submit
  // time" flow needs no change.
  const [fileName, setFileName] = React.useState<string | null>(null);
  const { vatRate } = useVatRate();
  const { vehicleVatRate } = useVehicleVatDeductibleRate();
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      vendor: initial?.vendor ?? "",
      supplier_tax_id: initial?.supplier_tax_id ?? "",
      expense_date: initial?.expense_date ?? new Date().toISOString().slice(0, 10),
      amount: initial?.amount ?? 0,
      vat_amount: initial?.vat_amount ?? null,
      vat_deductible_rate: initial?.vat_deductible_rate ?? 1,
      category: initial?.category ?? "other",
      payment_method: initial?.payment_method ?? "",
      job_id: initial?.job_id ?? "",
      customer_id: initial?.customer_id ?? "",
      notes: initial?.notes ?? "",
    },
  });

  const amount = watch("amount");
  const category = watch("category");

  // The VAT hidden inside a gross amount. Auto-filled as the amount is
  // typed, but only until the field is touched — a receipt occasionally
  // rounds differently, or comes from a supplier who charges no VAT at all,
  // and a typed value must never be overwritten by the guess.
  const [vatTouched, setVatTouched] = React.useState(Boolean(initial));
  React.useEffect(() => {
    if (vatTouched) return;
    const gross = Number(amount) || 0;
    const implied = gross > 0 ? Math.round((gross - gross / (1 + vatRate)) * 100) / 100 : 0;
    setValue("vat_amount", implied);
  }, [amount, vatRate, vatTouched, setValue]);

  // Vehicle and fuel default to whatever was agreed with the accountant
  // (settings), everything else to fully deductible. Only applied while
  // creating, so editing an old expense never silently re-rates it.
  React.useEffect(() => {
    if (initial) return;
    setValue("vat_deductible_rate", category === "fuel_vehicle" ? vehicleVatRate : 1);
  }, [category, vehicleVatRate, initial, setValue]);

  const submit = (values: ExpenseInput) => {
    const file = fileInputRef.current?.files?.[0] ?? null;
    onSubmit(values, file);
  };

  return (
    <Card>
      <CardContent className="p-4">
        {/* id lets ExpenseDetailPage's fixed DetailToolbar submit this form
            with a `form="expense-form"` button while editing, so "שמור" is
            reachable without scrolling all the way down here first — same
            pattern as InspectionHeaderForm's sticky bar (see
            ResourceCategoryDetailPage) and QuoteForm's "quote-form". */}
        <form id="expense-form" onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="ספק / בית עסק" htmlFor="vendor" error={errors.vendor?.message}>
              <Input id="vendor" {...register("vendor")} />
            </FormField>
            <FormField label="ח.פ / מספר עוסק של הספק" htmlFor="supplier_tax_id" error={errors.supplier_tax_id?.message}>
              <Input id="supplier_tax_id" dir="ltr" {...register("supplier_tax_id")} />
            </FormField>
            <FormField label="תאריך" htmlFor="expense_date" error={errors.expense_date?.message}>
              <Input id="expense_date" type="date" {...register("expense_date")} />
            </FormField>
            <FormField label="סכום כולל מע״מ (₪)" htmlFor="amount" error={errors.amount?.message}>
              <Input id="amount" type="number" step="0.01" {...register("amount")} />
            </FormField>
            <FormField label="מע״מ בקבלה (₪)" htmlFor="vat_amount" error={errors.vat_amount?.message}>
              <Input
                id="vat_amount"
                type="number"
                step="0.01"
                {...register("vat_amount")}
                onInput={() => setVatTouched(true)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                מחושב אוטומטית לפי {Math.round(vatRate * 100)}% — אפשר לתקן לפי הקבלה.
              </p>
            </FormField>
            <FormField
              label="% מהמע״מ שמוכר לקיזוז"
              htmlFor="vat_deductible_rate"
              error={errors.vat_deductible_rate?.message}
            >
              <Controller
                name="vat_deductible_rate"
                control={control}
                render={({ field }) => (
                  <StatusSelect
                    id="vat_deductible_rate"
                    showDot={false}
                    value={String(field.value)}
                    onChange={(next) => field.onChange(Number(next))}
                    options={[
                      { value: "1", label: "100% — מוכר במלואו" },
                      { value: "0.5", label: "50%" },
                      { value: "0", label: "0% — לא מוכר" },
                    ]}
                  />
                )}
              />
              {category === "fuel_vehicle" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ברכב פרטי לרוב אי אפשר לקזז מע״מ כלל, וברכב מסחרי כן. ברירת המחדל נקבעת בהגדרות.
                </p>
              )}
            </FormField>
            <FormField label="קטגוריה" htmlFor="category" error={errors.category?.message}>
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <StatusSelect
                    id="category"
                    showDot={false}
                    value={field.value as ExpenseCategory}
                    onChange={field.onChange}
                    options={Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => ({
                      value: value as ExpenseCategory,
                      label,
                    }))}
                  />
                )}
              />
            </FormField>
            <FormField label="אמצעי תשלום" htmlFor="payment_method" error={errors.payment_method?.message}>
              <Controller
                name="payment_method"
                control={control}
                render={({ field }) => (
                  <StatusSelect
                    id="payment_method"
                    showDot={false}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    options={[
                      { value: "" as const, label: "ללא" },
                      ...Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
                        value: value as PaymentMethod,
                        label,
                      })),
                    ]}
                  />
                )}
              />
            </FormField>
            {/* Optional, and the only way to ever answer "what did this job
                actually cost me" — without it an expense belongs to the
                business in general and nothing else. */}
            <FormField label="עבודה מקושרת" htmlFor="job_id" error={errors.job_id?.message}>
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
          </div>

          <FormField label="קבלה מצורפת" htmlFor="receipt">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                בחירת קובץ
              </Button>
              <span className="truncate text-sm text-muted-foreground">{fileName ?? "לא נבחרה קבלה"}</span>
              {/* accept lets a phone offer the camera alongside the gallery,
                  so photographing a receipt at the supplier's counter is the
                  path of least resistance rather than a later chore. */}
              <input
                ref={fileInputRef}
                id="receipt"
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
            </div>
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
