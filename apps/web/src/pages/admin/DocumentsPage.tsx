import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  documentSchema,
  type DocumentRecord,
  type Customer,
  type Job,
  type DocumentStatus,
  DOCUMENT_STATUS_LABELS,
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
  TableSkeleton,
  Textarea,
  useToast,
} from "@repo/ui";
import { FormField } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { DetailToolbar } from "../../components/DetailToolbar";
import { StatusBadge } from "../../components/StatusBadge";
import { StatusSelect } from "../../components/StatusSelect";
import { IconFolder } from "../../components/icons";
import { formatDate } from "../../lib/format";
import { documentExpiryState } from "../../lib/documentExpiry";
import { getErrorMessage } from "../../lib/errors";
import { safeStorageFileName } from "../../lib/storage";
import { supabase } from "../../lib/supabase";

export const documentFormSchema = documentSchema.extend({
  status: z.enum(["needed", "in_progress", "submitted", "approved", "rejected"]).optional(),
});
export type DocumentFormInput = z.infer<typeof documentFormSchema>;

export const DOCUMENT_TYPE_OPTIONS = [
  { value: "other", label: "אחר" },
  { value: "connection_approval", label: "אישור חיבור חח״י" },
  { value: "safety_certificate", label: "תעודת בטיחות" },
  { value: "permit", label: "היתר" },
  { value: "insurance", label: "ביטוח" },
];

export const DOCUMENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_TYPE_OPTIONS.map((opt) => [opt.value, opt.label])
);

// Downloading a document's file is useful straight from the list (no need
// to open the item first just to grab the PDF), so it's shared between
// this list page and DocumentDetailPage instead of duplicated.
export async function downloadDocumentFile(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60);
  if (error || !data) {
    return "שגיאה בפתיחת הקובץ: " + (error?.message ?? "לא נמצא");
  }
  window.open(data.signedUrl, "_blank");
  return null;
}

// The list itself only browses/creates — every row is a compact link into
// its own page (DocumentDetailPage), which is where viewing/editing/
// deleting a document actually happens. "הורדה" (download) stays as a quick
// action right here in the row, since grabbing the file is the single most
// common thing done from this list.
export function DocumentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");

  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
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

  const customerNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    (customers ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const filtered = (documents ?? []).filter((doc) => {
    if (typeFilter !== "all" && doc.type !== typeFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const customerName = doc.customer_id ? customerNameById.get(doc.customer_id) ?? "" : "";
    return [doc.title, customerName].some((v) => v.toLowerCase().includes(q));
  });

  const create = useMutation({
    mutationFn: async (input: { values: DocumentFormInput; file: File | null }) => {
      const { values, file } = input;
      let filePath: string | null = null;
      if (file) {
        const folder = values.customer_id || "general";
        const path = `${folder}/${Date.now()}-${safeStorageFileName(file.name)}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        filePath = path;
      }

      const { status, ...rest } = values;
      const payload = {
        customer_id: rest.customer_id || null,
        job_id: rest.job_id || null,
        type: rest.type,
        title: rest.title,
        due_date: rest.due_date || null,
        expiry_date: rest.expiry_date || null,
        visible_to_customer: rest.visible_to_customer,
        notes: rest.notes || null,
        file_path: filePath,
        ...(status ? { status } : {}),
      };
      const { error } = await supabase.from("documents").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      setCreating(false);
      toast({ title: "המסמך נשמר בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת המסמך נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const download = async (path: string) => {
    setDownloadError(null);
    const err = await downloadDocumentFile(path);
    if (err) setDownloadError(err);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Pinned like every detail page's DetailToolbar — see QuotesPage.tsx
          for the full reasoning. */}
      <DetailToolbar>
        <span className="text-sm font-medium text-muted-foreground">{strings.nav.documents}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setCreating((v) => !v)}>+ מסמך חדש</Button>
        </div>
      </DetailToolbar>
      <PageHeader
        title={strings.nav.documents}
        description="מסמכי בירוקרטיה ותאימות — אישורים, תעודות, היתרים. ניתן לצרף קובץ ולסמן נראות ללקוח."
        icon={IconFolder}
        color="bg-orange-500"
      />

      {downloadError && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{downloadError}</span>
          <button onClick={() => setDownloadError(null)} className="font-medium underline">
            סגירה
          </button>
        </div>
      )}

      {creating && (
        <DocumentForm
          initial={null}
          customers={customers ?? []}
          jobs={jobs ?? []}
          submitting={create.isPending}
          error={create.error instanceof Error ? create.error.message : null}
          onCancel={() => setCreating(false)}
          onSubmit={(values, file) => create.mutate({ values, file })}
        />
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              placeholder="חיפוש לפי כותרת או לקוח..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <StatusSelect
              aria-label="סינון לפי סוג מסמך"
              className="sm:w-56"
              showDot={false}
              value={typeFilter}
              onChange={setTypeFilter}
              options={[{ value: "all", label: "כל הסוגים" }, ...DOCUMENT_TYPE_OPTIONS]}
            />
          </div>
          {isLoading ? (
            <TableSkeleton columns={8} />
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">{strings.common.noResults}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>כותרת</TableHead>
                  <TableHead>סוג</TableHead>
                  <TableHead>לקוח</TableHead>
                  <TableHead>{strings.common.status}</TableHead>
                  <TableHead>יעד</TableHead>
                  <TableHead>תוקף</TableHead>
                  <TableHead>גלוי ללקוח</TableHead>
                  <TableHead>קובץ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((doc) => {
                  const expiry = documentExpiryState(doc.expiry_date);
                  return (
                  <TableRow
                    key={doc.id}
                    onClick={() => navigate(`/admin/documents/${doc.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>{DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}</TableCell>
                    <TableCell>{doc.customer_id ? customerNameById.get(doc.customer_id) ?? "—" : "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} label={DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status} />
                    </TableCell>
                    <TableCell>{formatDate(doc.due_date)}</TableCell>
                    <TableCell>
                      {expiry.state === "none" ? (
                        "—"
                      ) : expiry.state === "valid" ? (
                        formatDate(doc.expiry_date)
                      ) : (
                        <StatusBadge status={expiry.badgeStatus} label={expiry.label} />
                      )}
                    </TableCell>
                    <TableCell>{doc.visible_to_customer ? "כן" : "לא"}</TableCell>
                    <TableCell>
                      {/* stopPropagation — the row itself now navigates to
                          the document's page on click, but downloading the
                          file is a quick action that should stay right
                          here instead of also opening that page. */}
                      {doc.file_path ? (
                        <button
                          className="text-primary underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            void download(doc.file_path as string);
                          }}
                        >
                          הורדה
                        </button>
                      ) : (
                        "—"
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
    </div>
  );
}

export interface DocumentFormProps {
  initial: DocumentRecord | null;
  customers: Customer[];
  jobs: Job[];
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: DocumentFormInput, file: File | null) => void;
}

// Exported so DocumentDetailPage can reuse the exact same fields/validation
// for editing an existing document — this list page only ever uses it for
// creating a new one.
export function DocumentForm({ initial, customers, jobs, submitting, error, onCancel, onSubmit }: DocumentFormProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // The native <input type="file"> renders as the browser's own square,
  // unstyled button — out of place next to the rest of the kit's rounded
  // controls. Kept in the DOM (hidden, not removed) so the existing
  // fileInputRef-based "read the file at submit time" flow needs no
  // change; a styled Button triggers its click(), and this just mirrors
  // the chosen name back for a visual confirmation the native control
  // would otherwise have shown on its own.
  const [fileName, setFileName] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<DocumentFormInput>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: {
      customer_id: initial?.customer_id ?? "",
      job_id: initial?.job_id ?? "",
      type: initial?.type ?? "other",
      title: initial?.title ?? "",
      due_date: initial?.due_date ?? "",
      expiry_date: initial?.expiry_date ?? "",
      visible_to_customer: initial?.visible_to_customer ?? false,
      notes: initial?.notes ?? "",
      status: initial?.status ?? "needed",
    },
  });

  const submit = (values: DocumentFormInput) => {
    const file = fileInputRef.current?.files?.[0] ?? null;
    onSubmit(values, file);
  };

  return (
    <Card>
      <CardContent className="p-4">
        {/* id lets DocumentDetailPage's fixed DetailToolbar submit this form
            with a `form="document-form"` button while editing, so "שמור" is
            reachable without scrolling all the way down here first — same
            pattern as InspectionHeaderForm's sticky bar (see
            ResourceCategoryDetailPage) and QuoteForm's "quote-form". */}
        <form id="document-form" onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="כותרת" htmlFor="title" error={errors.title?.message}>
              <Input id="title" {...register("title")} />
            </FormField>
            <FormField label="סוג מסמך" htmlFor="type" error={errors.type?.message}>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <StatusSelect
                    id="type"
                    showDot={false}
                    value={field.value}
                    onChange={field.onChange}
                    options={DOCUMENT_TYPE_OPTIONS.map((opt) => ({
                      value: opt.value as DocumentFormInput["type"],
                      label: opt.label,
                    }))}
                  />
                )}
              />
            </FormField>
            <FormField label="לקוח (אופציונלי)" htmlFor="customer_id" error={errors.customer_id?.message}>
              <Controller
                name="customer_id"
                control={control}
                render={({ field }) => (
                  <Combobox
                    id="customer_id"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    options={customers.map((c) => ({ value: c.id, label: c.name, sublabel: c.phone ?? undefined }))}
                    placeholder="בחר/י לקוח..."
                    emptyOptionLabel="ללא"
                  />
                )}
              />
            </FormField>
            <FormField label="עבודה (אופציונלי)" htmlFor="job_id" error={errors.job_id?.message}>
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
            <FormField label="יעד להשלמה" htmlFor="due_date" error={errors.due_date?.message}>
              <Input id="due_date" type="date" {...register("due_date")} />
            </FormField>
            {/* When the document itself (not the task of getting it) expires
                and needs renewing — a license, an insurance policy, a
                safety certificate. Separate from due_date above, and
                optional, since most document types never expire. */}
            <FormField label="תוקף / תאריך פקיעה (אופציונלי)" htmlFor="expiry_date" error={errors.expiry_date?.message}>
              <Input id="expiry_date" type="date" {...register("expiry_date")} />
            </FormField>
            {initial && (
              <FormField label={strings.common.status} htmlFor="status" error={errors.status?.message}>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <StatusSelect
                      id="status"
                      value={field.value as DocumentStatus}
                      onChange={field.onChange}
                      options={Object.entries(DOCUMENT_STATUS_LABELS).map(([value, label]) => ({
                        value: value as DocumentStatus,
                        label,
                      }))}
                    />
                  )}
                />
              </FormField>
            )}
          </div>

          <FormField label="קובץ מצורף" htmlFor="file">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                בחירת קובץ
              </Button>
              <span className="truncate text-sm text-muted-foreground">{fileName ?? "לא נבחר קובץ"}</span>
              <input
                ref={fileInputRef}
                id="file"
                type="file"
                className="hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
            </div>
            {initial?.file_path && <p className="mt-1 text-xs text-muted-foreground">קיים כבר קובץ מצורף — בחירת קובץ חדש תחליף אותו.</p>}
          </FormField>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("visible_to_customer")} className="h-4 w-4" />
            גלוי ללקוח בפורטל
          </label>

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
