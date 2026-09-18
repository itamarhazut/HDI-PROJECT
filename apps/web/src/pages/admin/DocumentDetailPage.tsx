import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type DocumentRecord, DOCUMENT_STATUS_LABELS, strings } from "@repo/shared";
import { Button, Card, CardContent, useConfirmDialog, useToast } from "@repo/ui";
import { DetailToolbar } from "../../components/DetailToolbar";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { IconFolder } from "../../components/icons";
import { formatDate } from "../../lib/format";
import { documentExpiryState } from "../../lib/documentExpiry";
import { getErrorMessage } from "../../lib/errors";
import { safeStorageFileName } from "../../lib/storage";
import { supabase } from "../../lib/supabase";
import {
  DOCUMENT_TYPE_LABELS,
  DocumentForm,
  type DocumentFormInput,
  downloadDocumentFile,
} from "./DocumentsPage";

// The document card you land on after clicking a row in DocumentsPage —
// viewing, editing, downloading and deleting all happen here instead of
// inline in the list, so opening one document doesn't also show the rest
// of the list at the same time. Same split as CustomerDetailPage /
// JobDetailPage.
//
// Named `doc`, not `document` — the latter would shadow the DOM global.
export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["documents", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").eq("id", id as string).single();
      if (error) throw error;
      return data as DocumentRecord;
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
    mutationFn: async (input: { values: DocumentFormInput; file: File | null }) => {
      const { values, file } = input;
      const existingFilePath = doc?.file_path ?? null;
      let filePath = existingFilePath;
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
      const { error } = await supabase.from("documents").update(payload).eq("id", id as string);
      if (error) throw error;

      // Replacing a file used to leave the previous one sitting in the
      // bucket with nothing pointing at it — deletes cleaned up, replaces
      // never did. Done only after the row is safely saved, so a failed
      // save can't take the old file with it.
      if (file && existingFilePath && existingFilePath !== filePath) {
        await supabase.storage.from("documents").remove([existingFilePath]);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents", id] });
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      setEditing(false);
      toast({ title: "המסמך נשמר בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת המסמך נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (doc?.file_path) {
        await supabase.storage.from("documents").remove([doc.file_path]);
      }
      const { error } = await supabase.from("documents").delete().eq("id", id as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast({ title: "המסמך נמחק", variant: "success" });
      navigate("/admin/documents");
    },
    onError: (err) => toast({ title: "מחיקת המסמך נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const download = async (path: string) => {
    setDownloadError(null);
    const err = await downloadDocumentFile(path);
    if (err) setDownloadError(err);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">{strings.common.loading}</p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">המסמך לא נמצא.</p>
      </div>
    );
  }

  const expiry = documentExpiryState(doc.expiry_date);

  return (
    <div className="flex flex-col gap-6">
      <DetailToolbar>
        <BackLink />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {editing && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                {strings.common.cancel}
              </Button>
              <Button type="submit" form="document-form" size="sm" disabled={update.isPending}>
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
                    title: "מחיקת מסמך",
                    description: `למחוק את המסמך "${doc.title}"? הפעולה אינה הפיכה.`,
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
      <PageHeader title={doc.title} description="מסמך." icon={IconFolder} color="bg-orange-500" />

      {downloadError && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{downloadError}</span>
          <button onClick={() => setDownloadError(null)} className="font-medium underline">
            סגירה
          </button>
        </div>
      )}

      {editing ? (
        <DocumentForm
          initial={doc}
          customers={customers ?? []}
          jobs={jobs ?? []}
          submitting={update.isPending}
          error={update.error instanceof Error ? update.error.message : null}
          onCancel={() => setEditing(false)}
          onSubmit={(values, file) => update.mutate({ values, file })}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <div>
              <StatusBadge status={doc.status} label={DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status} />
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">סוג מסמך</dt>
                <dd className="text-sm font-medium">{DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">לקוח</dt>
                <dd className="text-sm font-medium">
                  {doc.customer_id ? customerNameById.get(doc.customer_id) ?? "—" : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">עבודה</dt>
                <dd className="text-sm font-medium">{doc.job_id ? jobTitleById.get(doc.job_id) ?? "—" : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">יעד להשלמה</dt>
                <dd className="text-sm font-medium">{formatDate(doc.due_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">תוקף</dt>
                <dd className="text-sm font-medium">
                  {expiry.state === "none" ? (
                    "—"
                  ) : expiry.state === "valid" ? (
                    formatDate(doc.expiry_date)
                  ) : (
                    <StatusBadge status={expiry.badgeStatus} label={expiry.label} />
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">גלוי ללקוח</dt>
                <dd className="text-sm font-medium">{doc.visible_to_customer ? "כן" : "לא"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">קובץ מצורף</dt>
                <dd className="text-sm font-medium">
                  {doc.file_path ? (
                    <button className="text-primary underline" onClick={() => void download(doc.file_path as string)}>
                      הורדה
                    </button>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>

            {doc.notes && (
              <div>
                <p className="text-xs text-muted-foreground">הערות</p>
                <p className="whitespace-pre-wrap text-sm">{doc.notes}</p>
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
    <Link to="/admin/documents" className="text-sm font-medium text-muted-foreground hover:text-foreground">
      ‹ {strings.common.back} למסמכים
    </Link>
  );
}
