import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  documentSchema,
  type DocumentRecord,
  type Customer,
  type Job,
  DOCUMENT_STATUS_LABELS,
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
  Textarea,
} from "@repo/ui";
import { FormField } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDate } from "../../lib/format";
import { supabase } from "../../lib/supabase";

const documentFormSchema = documentSchema.extend({
  status: z.enum(["needed", "in_progress", "submitted", "approved", "rejected"]).optional(),
});
type DocumentFormInput = z.infer<typeof documentFormSchema>;

const DOCUMENT_TYPE_OPTIONS = [
  { value: "other", label: "אחר" },
  { value: "connection_approval", label: "אישור חיבור חח״י" },
  { value: "safety_certificate", label: "תעודת בטיחות" },
  { value: "permit", label: "היתר" },
  { value: "insurance", label: "ביטוח" },
];

export function DocumentsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<DocumentRecord | "new" | null>(null);

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

  const upsert = useMutation({
    mutationFn: async (input: { values: DocumentFormInput; id?: string; existingFilePath: string | null; file: File | null }) => {
      const { values, id, existingFilePath, file } = input;
      let filePath = existingFilePath;
      if (file) {
        const folder = values.customer_id || "general";
        const path = `${folder}/${Date.now()}-${file.name}`;
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
        visible_to_customer: rest.visible_to_customer,
        notes: rest.notes || null,
        file_path: filePath,
        ...(status ? { status } : {}),
      };
      if (id) {
        const { error } = await supabase.from("documents").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("documents").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: async (doc: DocumentRecord) => {
      if (doc.file_path) {
        await supabase.storage.from("documents").remove([doc.file_path]);
      }
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60);
    if (error || !data) {
      alert("שגיאה בפתיחת הקובץ: " + (error?.message ?? "לא נמצא"));
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={strings.nav.documents}
        description="מסמכי בירוקרטיה ותאימות — אישורים, תעודות, היתרים. ניתן לצרף קובץ ולסמן נראות ללקוח."
        action={<Button onClick={() => setEditing((c) => (c === "new" ? null : "new"))}>+ מסמך חדש</Button>}
      />

      {editing && (
        <DocumentForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          customers={customers ?? []}
          jobs={jobs ?? []}
          submitting={upsert.isPending}
          error={upsert.error instanceof Error ? upsert.error.message : null}
          onCancel={() => setEditing(null)}
          onSubmit={(values, file) =>
            upsert.mutate({
              values,
              id: editing === "new" ? undefined : editing.id,
              existingFilePath: editing === "new" ? null : editing.file_path,
              file,
            })
          }
        />
      )}

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <p className="text-muted-foreground">{strings.common.loading}</p>
          ) : (documents ?? []).length === 0 ? (
            <p className="text-muted-foreground">{strings.common.noResults}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>כותרת</TableHead>
                  <TableHead>לקוח</TableHead>
                  <TableHead>{strings.common.status}</TableHead>
                  <TableHead>יעד</TableHead>
                  <TableHead>גלוי ללקוח</TableHead>
                  <TableHead>קובץ</TableHead>
                  <TableHead>{strings.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(documents ?? []).map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>{doc.customer_id ? customerNameById.get(doc.customer_id) ?? "—" : "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} label={DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status} />
                    </TableCell>
                    <TableCell>{formatDate(doc.due_date)}</TableCell>
                    <TableCell>{doc.visible_to_customer ? "כן" : "לא"}</TableCell>
                    <TableCell>
                      {doc.file_path ? (
                        <button className="text-primary underline" onClick={() => void download(doc.file_path as string)}>
                          הורדה
                        </button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(doc)}>
                          {strings.common.edit}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm(`למחוק את המסמך "${doc.title}"?`)) remove.mutate(doc);
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

interface DocumentFormProps {
  initial: DocumentRecord | null;
  customers: Customer[];
  jobs: Job[];
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: DocumentFormInput, file: File | null) => void;
}

function DocumentForm({ initial, customers, jobs, submitting, error, onCancel, onSubmit }: DocumentFormProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DocumentFormInput>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: {
      customer_id: initial?.customer_id ?? "",
      job_id: initial?.job_id ?? "",
      type: initial?.type ?? "other",
      title: initial?.title ?? "",
      due_date: initial?.due_date ?? "",
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
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="כותרת" htmlFor="title" error={errors.title?.message}>
              <Input id="title" {...register("title")} />
            </FormField>
            <FormField label="סוג מסמך" htmlFor="type" error={errors.type?.message}>
              <Select id="type" {...register("type")}>
                {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="לקוח (אופציונלי)" htmlFor="customer_id" error={errors.customer_id?.message}>
              <Select id="customer_id" {...register("customer_id")}>
                <option value="">ללא</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="עבודה (אופציונלי)" htmlFor="job_id" error={errors.job_id?.message}>
              <Select id="job_id" {...register("job_id")}>
                <option value="">ללא</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="יעד להשלמה" htmlFor="due_date" error={errors.due_date?.message}>
              <Input id="due_date" type="date" {...register("due_date")} />
            </FormField>
            {initial && (
              <FormField label={strings.common.status} htmlFor="status" error={errors.status?.message}>
                <Select id="status" {...register("status")}>
                  {Object.entries(DOCUMENT_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>

          <FormField label="קובץ מצורף" htmlFor="file">
            <input ref={fileInputRef} id="file" type="file" className="text-sm" />
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
