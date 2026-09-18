import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  resourceCategorySchema,
  type ResourceCategoryInput,
  type ResourceCategory,
  type ResourceFile,
  type Customer,
  type Inspection,
  type ChecklistItemStatus,
  type DocumentSlot,
  strings,
} from "@repo/shared";
import { Button, Card, CardContent, Combobox, Input, Modal, Textarea, useConfirmDialog, useToast } from "@repo/ui";
import { DetailToolbar } from "../../components/DetailToolbar";
import { FormField } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { StatusSelect } from "../../components/StatusSelect";
import { IconChevronDown, IconFileText, IconInfo, IconPencil } from "../../components/icons";
import { QuickAddCustomerModal } from "../../components/QuickAddCustomerModal";
import iecLogo from "../../assets/iec-logo.png";
import {
  groupChecklistQuestions,
  CONNECTION_PHASE_OPTIONS,
  CONNECTION_AMPS_OPTIONS,
  formatConnectionSize,
  maxAllowedLoopImpedance,
  nextInspectionDueDate,
  breakerRatingLabel,
  GROUNDING_SUPPLY_VOLTAGE,
  PANEL_MATERIAL_OPTIONS,
  INSULATION_UNIT_OPTIONS,
  type ChecklistSection,
  type GroundingCalcState,
  type PanelMaterial,
  type InsulationCalcState,
  type InsulationUnit,
} from "../../lib/inspectionChecklist";
import { formatDate } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { safeStorageFileName } from "../../lib/storage";
import { supabase } from "../../lib/supabase";

// Every "חברת חשמל" category is a compact row on ResourceLibraryPage; this
// is where you land after clicking one. Two very different bodies share
// this page depending on category.is_checklist:
//   - "בדיקות" — a history of past inspections (its own `inspections`
//     table row per visit) plus a "התחלת בדיקה חדשה" action, personal-use
//     only, no edit/delete on the category itself;
//   - every other category — the original free-text notes + files card,
//     with edit/delete here instead of inline in the list. The notes are
//     shown only via the "i" button, to keep the page itself short.
export function ResourceCategoryDetailPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [infoOpen, setInfoOpen] = React.useState(false);
  // The "בדיקות" category's fixed document-slots modal (see DocumentSlot) —
  // reference paperwork for the category as a whole, not tied to one visit.
  const [docsOpen, setDocsOpen] = React.useState(false);
  // Which past inspection (if any) is open for viewing/editing right now —
  // null shows the history list instead.
  const [openInspectionId, setOpenInspectionId] = React.useState<string | null>(null);

  const { data: category, isLoading } = useQuery({
    queryKey: ["resource_categories", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase.from("resource_categories").select("*").eq("id", categoryId as string).single();
      if (error) throw error;
      return data as ResourceCategory;
    },
    enabled: !!categoryId,
  });

  // Also used by the "בדיקות" category's fixed document slots below (a
  // slot's file is just a ResourceFile row whose slot_id points at it), so
  // this stays enabled for every category, not only the non-checklist ones.
  const { data: files } = useQuery({
    queryKey: ["resource_files", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_files")
        .select("*")
        .eq("category_id", categoryId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!categoryId,
  });

  // The "בדיקות" category's fixed-but-editable list of optional document
  // names (see DocumentSlot) — shown behind the documents icon next to
  // "+ התחלת בדיקה חדשה", not tied to any single inspection.
  const { data: documentSlots } = useQuery({
    queryKey: ["document_slots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("document_slots").select("*").order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!category?.is_checklist,
  });

  // Same customer list/picker used by the quote form — kept as a separate
  // query (not shared with QuotesPage's) since query keys are per-page in
  // this app, but the invalidation QuickAddCustomerModal fires on
  // ["customers"] still catches this one too (react-query invalidates by
  // key prefix).
  const { data: customers } = useQuery({
    queryKey: ["customers", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!category?.is_checklist,
  });

  const { data: inspections } = useQuery({
    queryKey: ["inspections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .order("inspection_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!category?.is_checklist,
  });

  // The checklist's questions — editable/deletable from this page (the
  // pencil icon next to each one), so they live in their own table instead
  // of a hardcoded constant. Kept sorted by sort_order and grouped back
  // into sections client-side (groupChecklistQuestions), same shape the
  // page always rendered.
  const { data: checklistQuestions } = useQuery({
    queryKey: ["checklist_questions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("checklist_questions").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!category?.is_checklist,
  });

  const checklistSections = React.useMemo(
    () => groupChecklistQuestions(checklistQuestions ?? []),
    [checklistQuestions]
  );

  const customerNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    (customers ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const updateCategory = useMutation({
    mutationFn: async (values: ResourceCategoryInput) => {
      const { error } = await supabase
        .from("resource_categories")
        .update({ name: values.name, notes: values.notes || null })
        .eq("id", categoryId as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resource_categories"] });
      setEditing(false);
      toast({ title: "הקטגוריה נשמרה בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת הקטגוריה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const deleteCategory = useMutation({
    mutationFn: async () => {
      if ((files ?? []).length > 0) {
        await supabase.storage.from("documents").remove((files ?? []).map((f) => f.file_path));
      }
      const { error } = await supabase.from("resource_categories").delete().eq("id", categoryId as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resource_categories"] });
      void queryClient.invalidateQueries({ queryKey: ["resource_files"] });
      toast({ title: "הקטגוריה נמחקה", variant: "success" });
      navigate("/admin/resources");
    },
    onError: (err) => toast({ title: "מחיקת הקטגוריה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const uploadFile = async (file: File) => {
    if (!categoryId) return;
    setActionError(null);
    setUploading(true);
    try {
      const path = `resources/${categoryId}/${Date.now()}-${safeStorageFileName(file.name)}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { error: insertErr } = await supabase
        .from("resource_files")
        .insert({ category_id: categoryId, file_name: file.name, file_path: path });
      if (insertErr) throw insertErr;
      void queryClient.invalidateQueries({ queryKey: ["resource_files", categoryId] });
      toast({ title: "הקובץ הועלה בהצלחה", variant: "success" });
    } catch (err) {
      setActionError("העלאת הקובץ נכשלה: " + getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = useMutation({
    mutationFn: async (file: ResourceFile) => {
      await supabase.storage.from("documents").remove([file.file_path]);
      const { error } = await supabase.from("resource_files").delete().eq("id", file.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resource_files", categoryId] });
      toast({ title: "הקובץ נמחק", variant: "success" });
    },
    onError: (err) => toast({ title: "מחיקת הקובץ נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const download = async (path: string) => {
    setActionError(null);
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60);
    if (error || !data) {
      setActionError("שגיאה בפתיחת הקובץ: " + (error?.message ?? "לא נמצא"));
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  // A document slot holds at most one file — uploading a new one replaces
  // whatever was there before (old file removed from storage + its row
  // deleted first), so "slotFileBySlotId" always has 0 or 1 entries per slot.
  const uploadSlotFile = async (slotId: string, file: File) => {
    if (!categoryId) return;
    setActionError(null);
    setUploading(true);
    try {
      const existing = (files ?? []).find((f) => f.slot_id === slotId);
      if (existing) {
        await supabase.storage.from("documents").remove([existing.file_path]);
        const { error: delErr } = await supabase.from("resource_files").delete().eq("id", existing.id);
        if (delErr) throw delErr;
      }
      const path = `resources/${categoryId}/${slotId}-${Date.now()}-${safeStorageFileName(file.name)}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { error: insertErr } = await supabase
        .from("resource_files")
        .insert({ category_id: categoryId, file_name: file.name, file_path: path, slot_id: slotId });
      if (insertErr) throw insertErr;
      void queryClient.invalidateQueries({ queryKey: ["resource_files", categoryId] });
      toast({ title: "הקובץ הועלה בהצלחה", variant: "success" });
    } catch (err) {
      setActionError("העלאת הקובץ נכשלה: " + getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const addDocumentSlot = useMutation({
    mutationFn: async (label: string) => {
      const nextOrder = documentSlots?.length ?? 0;
      const { error } = await supabase.from("document_slots").insert({ label, sort_order: nextOrder });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["document_slots"] }),
    onError: (err) => toast({ title: "הוספת שם המסמך נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const renameDocumentSlot = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await supabase.from("document_slots").update({ label }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["document_slots"] }),
    onError: (err) => toast({ title: "שינוי השם נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  const deleteDocumentSlot = useMutation({
    mutationFn: async (slot: DocumentSlot) => {
      const attached = (files ?? []).find((f) => f.slot_id === slot.id);
      if (attached) {
        await supabase.storage.from("documents").remove([attached.file_path]);
        const { error: delFileErr } = await supabase.from("resource_files").delete().eq("id", attached.id);
        if (delFileErr) throw delFileErr;
      }
      const { error } = await supabase.from("document_slots").delete().eq("id", slot.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["document_slots"] });
      void queryClient.invalidateQueries({ queryKey: ["resource_files", categoryId] });
      toast({ title: "שם המסמך נמחק", variant: "success" });
    },
    onError: (err) => toast({ title: "מחיקת שם המסמך נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  // Everything below is only relevant when category.is_checklist ("בדיקות").
  const createInspection = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .insert({ inspection_date: new Date().toISOString().slice(0, 10) })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ["inspections"] });
      setOpenInspectionId(id);
    },
    onError: (err) => toast({ title: "יצירת הבדיקה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const patchInspection = useMutation({
    mutationFn: async (patch: Partial<Inspection>) => {
      if (!openInspectionId) return;
      const { error } = await supabase.from("inspections").update(patch).eq("id", openInspectionId);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["inspections"] }),
    onError: (err) => toast({ title: "העדכון נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  const deleteInspection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inspections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["inspections"] });
      if (openInspectionId === id) setOpenInspectionId(null);
      toast({ title: "הבדיקה נמחקה", variant: "success" });
    },
    onError: (err) => toast({ title: "מחיקת הבדיקה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const updateChecklistQuestion = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await supabase.from("checklist_questions").update({ label }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["checklist_questions"] }),
    onError: (err) => toast({ title: "עדכון השאלה נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  const deleteChecklistQuestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklist_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist_questions"] });
      toast({ title: "השאלה נמחקה", variant: "success" });
    },
    onError: (err) => toast({ title: "מחיקת השאלה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  if (isLoading || !category) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">{isLoading ? strings.common.loading : strings.common.noResults}</p>
      </div>
    );
  }

  if (category.is_checklist) {
    const openInspection = openInspectionId ? (inspections ?? []).find((i) => i.id === openInspectionId) ?? null : null;

    return (
      <div className="flex flex-col gap-6">
        {/* While an inspection is open, its own fixed toolbar (back/info/
            save/delete) takes over this spot entirely — showing both would
            be redundant, and the fixed toolbar needs to own the very top
            of the screen without anything else competing for that space. */}
        {!openInspectionId && (
          <>
            {/* Same pinned-to-top treatment as InspectionDetail's own
                toolbar below (see DetailToolbar) — this category-level view
                used to have a plain, non-sticky BackLink here, so on a
                category with many past inspections, scrolling down lost the
                back link and action buttons entirely. */}
            <DetailToolbar>
              <Link to="/admin/resources" className="text-sm font-medium text-muted-foreground hover:text-foreground">
                ‹ {strings.common.back} לחברת חשמל
              </Link>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInfoOpen(true)}
                  aria-label="מידע"
                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <IconInfo className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setDocsOpen(true)}
                  aria-label="מסמכים"
                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <IconFileText className="h-5 w-5" />
                </button>
                <Button size="sm" onClick={() => createInspection.mutate()} disabled={createInspection.isPending}>
                  + התחלת בדיקה חדשה
                </Button>
              </div>
            </DetailToolbar>
            <PageHeader title={category.name} logoSrc={iecLogo} logoAlt="חברת החשמל" />
          </>
        )}

        {openInspectionId ? (
          openInspection ? (
            <InspectionDetail
              key={openInspection.id}
              inspection={openInspection}
              customers={customers ?? []}
              checklistSections={checklistSections}
              submittingHeader={patchInspection.isPending}
              onBack={() => setOpenInspectionId(null)}
              onInfo={() => setInfoOpen(true)}
              onSaveHeader={(patch) => patchInspection.mutate(patch, { onSuccess: () => setOpenInspectionId(null) })}
              onPatch={(patch) => patchInspection.mutate(patch)}
              onRenameQuestion={(id, label) => updateChecklistQuestion.mutate({ id, label })}
              onDeleteQuestion={(id) => deleteChecklistQuestion.mutate(id)}
              onDelete={async () => {
                const ok = await confirmDialog({
                  title: "מחיקת בדיקה",
                  description: "למחוק את הבדיקה הזו לצמיתות? הפעולה אינה הפיכה.",
                  confirmLabel: "מחק",
                  variant: "destructive",
                });
                if (ok) deleteInspection.mutate(openInspection.id);
              }}
            />
          ) : (
            <p className="text-muted-foreground">{strings.common.loading}</p>
          )
        ) : (
          <InspectionHistoryList
            inspections={inspections ?? []}
            customerNameById={customerNameById}
            onOpen={(id) => setOpenInspectionId(id)}
          />
        )}

        <Modal open={infoOpen} onClose={() => setInfoOpen(false)} title={category.name} maxWidthClassName="max-w-lg">
          {category.notes ? (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{category.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">אין הערות עדיין.</p>
          )}
        </Modal>

        <DocumentSlotsModal
          open={docsOpen}
          onClose={() => setDocsOpen(false)}
          slots={documentSlots ?? []}
          files={files ?? []}
          uploading={uploading}
          actionError={actionError}
          onUpload={uploadSlotFile}
          onDownload={download}
          onDeleteFile={(file) => deleteFile.mutate(file)}
          onAddSlot={(label) => addDocumentSlot.mutate(label)}
          onRenameSlot={(id, label) => renameDocumentSlot.mutate({ id, label })}
          onDeleteSlot={(slot) => deleteDocumentSlot.mutate(slot)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Same pinned-to-top treatment as InspectionDetail's own toolbar (see
          DetailToolbar) — this page used to have a plain, non-sticky
          BackLink here, so on a category with a lot of notes/files,
          scrolling down lost the back link and action buttons entirely. */}
      <DetailToolbar>
        <Link to="/admin/resources" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ {strings.common.back} לחברת חשמל
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInfoOpen(true)}
            aria-label="מידע"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <IconInfo className="h-5 w-5" />
          </button>
          <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
            {strings.common.edit}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              const ok = await confirmDialog({
                title: "מחיקת קטגוריה",
                description: `למחוק את "${category.name}" וכל הקבצים שבה? הפעולה אינה הפיכה.`,
                confirmLabel: "מחק",
                variant: "destructive",
              });
              if (ok) deleteCategory.mutate();
            }}
          >
            {strings.common.delete}
          </Button>
        </div>
      </DetailToolbar>
      <PageHeader title={category.name} logoSrc={iecLogo} logoAlt="חברת החשמל" />

      {actionError && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="font-medium underline">
            סגירה
          </button>
        </div>
      )}

      {editing && (
        <CategoryForm
          initial={category}
          submitting={updateCategory.isPending}
          error={updateCategory.error instanceof Error ? updateCategory.error.message : null}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => updateCategory.mutate(values)}
        />
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">קבצים</p>
            <label className="cursor-pointer text-xs font-medium text-primary underline">
              {uploading ? "מעלה..." : "+ הוספת קובץ"}
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadFile(file);
                }}
              />
            </label>
          </div>
          {(files ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">אין קבצים עדיין.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(files ?? []).map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-2 text-sm">
                  <button className="truncate text-primary underline" onClick={() => void download(file.file_path)}>
                    {file.file_name}
                  </button>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatDate(file.created_at)}</span>
                    <button
                      className="text-destructive underline"
                      onClick={async () => {
                        const ok = await confirmDialog({
                          title: "מחיקת קובץ",
                          description: `למחוק את "${file.file_name}"? הפעולה אינה הפיכה.`,
                          confirmLabel: "מחק",
                          variant: "destructive",
                        });
                        if (ok) deleteFile.mutate(file);
                      }}
                    >
                      {strings.common.delete}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Modal open={infoOpen} onClose={() => setInfoOpen(false)} title={category.name} maxWidthClassName="max-w-lg">
        {category.notes ? (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{category.notes}</p>
        ) : (
          <p className="text-sm text-muted-foreground">אין הערות עדיין.</p>
        )}
      </Modal>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/admin/resources" className="text-sm font-medium text-muted-foreground hover:text-foreground">
      ‹ {strings.common.back} לחברת חשמל
    </Link>
  );
}

interface DocumentSlotsModalProps {
  open: boolean;
  onClose: () => void;
  slots: DocumentSlot[];
  files: ResourceFile[];
  uploading: boolean;
  actionError: string | null;
  onUpload: (slotId: string, file: File) => void;
  onDownload: (path: string) => void;
  onDeleteFile: (file: ResourceFile) => void;
  onAddSlot: (label: string) => void;
  onRenameSlot: (id: string, label: string) => void;
  onDeleteSlot: (slot: DocumentSlot) => void;
}

// The "בדיקות" category's fixed-but-editable list of optional document
// names (e.g. "תעודת בודק מוסמך") — reference paperwork for the category
// as a whole, not tied to any single inspection visit. Each name can hold
// at most one uploaded file; names themselves are added/renamed/deleted
// the same way checklist questions are edited elsewhere on this page
// (pencil icon, inline) — nothing here needs a code change to adjust.
function DocumentSlotsModal({
  open,
  onClose,
  slots,
  files,
  uploading,
  actionError,
  onUpload,
  onDownload,
  onDeleteFile,
  onAddSlot,
  onRenameSlot,
  onDeleteSlot,
}: DocumentSlotsModalProps) {
  const [addingLabel, setAddingLabel] = React.useState("");

  const submitAdd = () => {
    const trimmed = addingLabel.trim();
    if (!trimmed) return;
    onAddSlot(trimmed);
    setAddingLabel("");
  };

  return (
    <Modal open={open} onClose={onClose} title="מסמכים" maxWidthClassName="max-w-lg">
      <div className="flex flex-col gap-1 divide-y divide-border">
        {slots.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">אין עדיין שמות מסמכים.</p>
        ) : (
          slots.map((slot) => (
            <DocumentSlotRow
              key={slot.id}
              slot={slot}
              file={files.find((f) => f.slot_id === slot.id) ?? null}
              uploading={uploading}
              onUpload={(file) => onUpload(slot.id, file)}
              onDownload={onDownload}
              onDeleteFile={onDeleteFile}
              onRename={(label) => onRenameSlot(slot.id, label)}
              onDeleteSlot={() => onDeleteSlot(slot)}
            />
          ))
        )}
      </div>

      {actionError && <p className="pt-2 text-sm text-destructive">{actionError}</p>}

      <div className="flex items-center gap-2 border-t border-border pt-3">
        <Input
          value={addingLabel}
          onChange={(e) => setAddingLabel(e.target.value)}
          placeholder="שם מסמך חדש..."
          className="min-w-0 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitAdd();
            }
          }}
        />
        <Button type="button" size="sm" disabled={!addingLabel.trim()} onClick={submitAdd}>
          + הוספה
        </Button>
      </div>
    </Modal>
  );
}

interface DocumentSlotRowProps {
  slot: DocumentSlot;
  file: ResourceFile | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onDownload: (path: string) => void;
  onDeleteFile: (file: ResourceFile) => void;
  onRename: (label: string) => void;
  onDeleteSlot: () => void;
}

function DocumentSlotRow({
  slot,
  file,
  uploading,
  onUpload,
  onDownload,
  onDeleteFile,
  onRename,
  onDeleteSlot,
}: DocumentSlotRowProps) {
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = React.useState(false);
  const [label, setLabel] = React.useState(slot.label);

  const save = () => {
    const trimmed = label.trim();
    if (trimmed && trimmed !== slot.label) onRename(trimmed);
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-2 py-2">
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="min-w-0 flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
          />
          <Button type="button" size="sm" onClick={save}>
            שמירה
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setLabel(slot.label);
              setEditing(false);
            }}
          >
            ביטול
          </Button>
          <button
            type="button"
            className="text-xs font-medium text-destructive underline"
            onClick={async () => {
              const ok = await confirmDialog({
                title: "מחיקת שם מסמך",
                description: `למחוק את "${slot.label}"?${
                  file ? " הקובץ המצורף אליו יימחק גם הוא." : ""
                } הפעולה אינה הפיכה.`,
                confirmLabel: "מחק",
                variant: "destructive",
              });
              if (ok) onDeleteSlot();
            }}
          >
            מחיקה
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="text-sm font-medium">{slot.label}</span>
              <button
                type="button"
                aria-label="עריכת שם המסמך"
                onClick={() => setEditing(true)}
                className="flex shrink-0 items-center justify-center rounded p-1 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
              >
                <IconPencil className="h-3.5 w-3.5" />
              </button>
            </div>
            {!file && (
              <label className="shrink-0 cursor-pointer text-xs font-medium text-primary underline">
                {uploading ? "מעלה..." : "+ העלאת קובץ"}
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    e.target.value = "";
                    if (selected) onUpload(selected);
                  }}
                />
              </label>
            )}
          </div>
          {file && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
              <IconFileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <button
                type="button"
                title={file.file_name}
                className="min-w-0 flex-1 truncate text-start text-xs font-medium text-primary underline"
                onClick={() => onDownload(file.file_path)}
              >
                {file.file_name}
              </button>
              <button
                type="button"
                aria-label="מחיקת הקובץ"
                className="shrink-0 text-xs font-medium text-destructive underline"
                onClick={() => onDeleteFile(file)}
              >
                {strings.common.delete}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface InspectionHistoryListProps {
  inspections: Inspection[];
  customerNameById: Map<string, string>;
  onOpen: (id: string) => void;
}

// The default view of "בדיקות" — every past inspection as its own compact
// row (no external "X מתוך Y" progress count — that idea was dropped
// entirely), newest first. "התחלת בדיקה חדשה" (in the page header above)
// is the only way in; there's no separate "current" one shown here.
function InspectionHistoryList({ inspections, customerNameById, onOpen }: InspectionHistoryListProps) {
  if (inspections.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          עדיין אין בדיקות שמורות. לחצו על &quot;התחלת בדיקה חדשה&quot; כדי להתחיל.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {inspections.map((inspection) => {
        const customerName = inspection.customer_id ? customerNameById.get(inspection.customer_id) ?? null : null;
        const sizeLabel = formatConnectionSize(inspection.connection_phase, inspection.connection_amps);
        const subtitleParts = [formatDate(inspection.inspection_date), inspection.address, sizeLabel].filter(Boolean);
        return (
          <button
            key={inspection.id}
            type="button"
            onClick={() => onOpen(inspection.id)}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-4 text-start text-card-foreground shadow-sm transition-colors hover:bg-accent"
          >
            <div>
              <p className="font-semibold">{customerName ?? "בדיקה ללא לקוח משויך"}</p>
              <p className="text-xs text-muted-foreground">{subtitleParts.join(" · ")}</p>
            </div>
            <IconChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}

interface InspectionDetailProps {
  inspection: Inspection;
  customers: Customer[];
  checklistSections: ChecklistSection[];
  submittingHeader: boolean;
  onBack: () => void;
  onInfo: () => void;
  // Saving the header form (top card: customer/address/date/...) navigates
  // straight back to the history list once it succeeds — that's the "save
  // and it shows up in the list" behavior. onPatch (below) is for every
  // other change on this page (a ✓/✗ mark, a calc value) and must NOT
  // navigate away, since those are meant to be ticked off one at a time
  // while staying on the page.
  onSaveHeader: (patch: Partial<Inspection>) => void;
  onPatch: (patch: Partial<Inspection>) => void;
  onRenameQuestion: (id: string, label: string) => void;
  onDeleteQuestion: (id: string) => void;
  onDelete: () => void;
}

// One inspection, opened either from the history list or right after
// "התחלת בדיקה חדשה". Every mark/field here saves straight to this
// inspection's own row (via onPatch), so switching back to the list and
// opening it again later shows exactly what was left.
function InspectionDetail({
  inspection,
  customers,
  checklistSections,
  submittingHeader,
  onBack,
  onInfo,
  onSaveHeader,
  onPatch,
  onRenameQuestion,
  onDeleteQuestion,
  onDelete,
}: InspectionDetailProps) {
  const items = inspection.items ?? {};
  const groundingCalc = (inspection.grounding_calc ?? {}) as GroundingCalcState;
  const insulationCalc = (inspection.insulation_calc ?? {}) as InsulationCalcState;

  // "חזרה" / מידע / שמירה / מחיקה — pinned to the very top of the screen at
  // all times via the shared DetailToolbar (see that component for how the
  // fixed positioning works). The save button submits via the `form`
  // attribute (a button outside a <form> can still trigger it by id), so
  // there's one save action, not two.
  return (
    <div className="flex flex-col gap-6">
      <DetailToolbar>
        <button type="button" onClick={onBack} className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ חזרה לרשימה
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onInfo}
            aria-label="מידע"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <IconInfo className="h-5 w-5" />
          </button>
          <Button type="submit" form="inspection-header-form" size="sm" disabled={submittingHeader}>
            שמירת פרטי הבדיקה
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            מחיקת בדיקה
          </Button>
        </div>
      </DetailToolbar>

      <InspectionHeaderForm initial={inspection} customers={customers} onSubmit={onSaveHeader} />

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          {checklistSections.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין שאלות בצ׳ק ליסט כרגע.</p>
          ) : (
            checklistSections.map((section) => (
              <div key={section.title} className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold text-muted-foreground">{section.title}</p>
                <ul className="flex flex-col divide-y divide-border">
                  {section.items.map((item) => (
                    <ChecklistItemRow
                      key={item.key}
                      item={item}
                      status={items[item.key]}
                      groundingCalc={groundingCalc}
                      insulationCalc={insulationCalc}
                      onMark={(status) => onPatch({ items: { ...items, [item.key]: status } })}
                      onCalcChange={(grounding_calc) => {
                        // Requirement: the grounding_loop_impedance mark is
                        // set automatically from the calc result — fail if
                        // the measured value is above what's allowed, pass
                        // if it's at or below it — but the ✓/✗ buttons
                        // (rendered regardless) can still override it.
                        const maxZs = maxAllowedLoopImpedance(GROUNDING_SUPPLY_VOLTAGE, grounding_calc.breaker_rating);
                        const measured = grounding_calc.measured_value;
                        const autoStatus: ChecklistItemStatus | undefined =
                          maxZs !== null && measured !== undefined ? (measured <= maxZs ? "pass" : "fail") : undefined;
                        onPatch({ grounding_calc, items: { ...items, [item.key]: autoStatus } });
                      }}
                      onInsulationChange={(insulation_calc) => onPatch({ insulation_calc })}
                      onRename={(label) => onRenameQuestion(item.key, label)}
                      onDelete={() => onDeleteQuestion(item.key)}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ChecklistItemRowProps {
  item: { key: string; label: string; hasCalc?: boolean; hasInsulationMeasurement?: boolean };
  status: ChecklistItemStatus | undefined;
  groundingCalc: GroundingCalcState;
  insulationCalc: InsulationCalcState;
  onMark: (status: ChecklistItemStatus | undefined) => void;
  onCalcChange: (calc: GroundingCalcState) => void;
  onInsulationChange: (calc: InsulationCalcState) => void;
  onRename: (label: string) => void;
  onDelete: () => void;
}

// One checklist question. Its label can be edited (or the question deleted
// entirely) via the small pencil icon, which swaps the row into an inline
// edit mode — no separate settings page needed. A hasCalc question (just
// the grounding loop-impedance one today) gets its mark set automatically
// whenever GroundingCalcPanel below it computes one — but the usual ✓/✗
// buttons are still shown too, so it can be overridden by hand (e.g. no
// calc data yet, or the electrician wants to decide for themselves). A
// hasInsulationMeasurement question (the insulation-value one) gets a
// small value+unit field for the reading, with no automatic pass/fail.
function ChecklistItemRow({
  item,
  status,
  groundingCalc,
  insulationCalc,
  onMark,
  onCalcChange,
  onInsulationChange,
  onRename,
  onDelete,
}: ChecklistItemRowProps) {
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = React.useState(false);
  const [label, setLabel] = React.useState(item.label);

  // Only fires the update if the label actually changed (and isn't blank),
  // so pressing "שמירה" without editing anything is a no-op.
  const save = () => {
    const trimmed = label.trim();
    if (trimmed && trimmed !== item.label) onRename(trimmed);
    setEditing(false);
  };

  return (
    <li className="flex flex-col gap-2 py-2">
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="min-w-0 flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
          />
          <Button type="button" size="sm" onClick={save}>
            שמירה
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setLabel(item.label);
              setEditing(false);
            }}
          >
            ביטול
          </Button>
          <button
            type="button"
            className="text-xs font-medium text-destructive underline"
            onClick={async () => {
              const ok = await confirmDialog({
                title: "מחיקת שאלה",
                description: `למחוק את השאלה "${item.label}"? הפעולה אינה הפיכה, וסימונים שנשמרו עליה בבדיקות קודמות יאבדו.`,
                confirmLabel: "מחק",
                variant: "destructive",
              });
              if (ok) onDelete();
            }}
          >
            מחיקה
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-sm">{item.label}</span>
            <button
              type="button"
              aria-label="עריכת השאלה"
              onClick={() => setEditing(true)}
              className="flex shrink-0 items-center justify-center rounded p-1 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
            >
              <IconPencil className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="תקין"
              onClick={() => onMark(status === "pass" ? undefined : "pass")}
              className={
                "flex h-7 w-7 items-center justify-center rounded-md border text-sm transition-colors " +
                (status === "pass"
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-border text-muted-foreground hover:bg-accent")
              }
            >
              ✓
            </button>
            <button
              type="button"
              aria-label="לא תקין"
              onClick={() => onMark(status === "fail" ? undefined : "fail")}
              className={
                "flex h-7 w-7 items-center justify-center rounded-md border text-sm transition-colors " +
                (status === "fail"
                  ? "border-destructive bg-destructive text-destructive-foreground"
                  : "border-border text-muted-foreground hover:bg-accent")
              }
            >
              ✗
            </button>
          </div>
        </div>
      )}
      {item.hasCalc && <GroundingCalcPanel initial={groundingCalc} onChange={onCalcChange} />}
      {item.hasInsulationMeasurement && (
        <InsulationMeasurementPanel initial={insulationCalc} onChange={onInsulationChange} />
      )}
    </li>
  );
}

interface InspectionHeaderFormValues {
  customer_id: string;
  address: string;
  inspection_date: string;
  electrician_name: string;
  electrician_license: string;
  connection_phase: string;
  connection_amps: string;
  subpanel_count: string;
  circuits_checked: string;
  frequency_years: string;
  thermal_test_done: boolean;
}

interface InspectionHeaderFormProps {
  initial: Inspection;
  customers: Customer[];
  onSubmit: (values: Partial<Inspection>) => void;
}

// "מה הבדיקה ומי הלקוח" — the header fields from the reference tool. The
// customer field is a real Combobox tied to the customers table (same
// picker + quick-add flow as the quote form), not free text, so an
// inspection's customer is a real record, not just a typed name.
//
// "גודל חיבור" is phase (חד/תלת פאזי) + a generic amps list combined into
// a label like "3x63A", replacing both the old free-text field and the
// separate "מתח הספקה" selector (redundant once the phase is chosen).
//
// No save button in here — it submits via the sticky bar in
// InspectionDetail (a button with form="inspection-header-form"), so it
// stays reachable without scrolling back up to this card.
function InspectionHeaderForm({ initial, customers, onSubmit }: InspectionHeaderFormProps) {
  const { register, handleSubmit, control, watch, setValue, getValues } = useForm<InspectionHeaderFormValues>({
    defaultValues: {
      customer_id: initial.customer_id ?? "",
      address: initial.address ?? "",
      inspection_date: initial.inspection_date ?? new Date().toISOString().slice(0, 10),
      electrician_name: initial.electrician_name ?? "",
      electrician_license: initial.electrician_license ?? "",
      connection_phase: initial.connection_phase ?? "",
      connection_amps: initial.connection_amps ? String(initial.connection_amps) : "",
      subpanel_count: initial.subpanel_count != null ? String(initial.subpanel_count) : "",
      circuits_checked: initial.circuits_checked != null ? String(initial.circuits_checked) : "",
      frequency_years: initial.frequency_years != null ? String(initial.frequency_years) : "",
      thermal_test_done: initial.thermal_test_done ?? false,
    },
  });
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);

  const inspectionDate = watch("inspection_date");
  const frequencyYears = watch("frequency_years");
  const connectionPhase = watch("connection_phase");
  const connectionAmps = watch("connection_amps");
  const dueDate = nextInspectionDueDate(inspectionDate, Number(frequencyYears) || undefined);
  const sizeLabel = formatConnectionSize(connectionPhase || null, Number(connectionAmps) || null);

  const submit = (values: InspectionHeaderFormValues) => {
    onSubmit({
      customer_id: values.customer_id || null,
      address: values.address || null,
      inspection_date: values.inspection_date || new Date().toISOString().slice(0, 10),
      electrician_name: values.electrician_name || null,
      electrician_license: values.electrician_license || null,
      connection_phase: values.connection_phase || null,
      connection_amps: values.connection_amps ? Number(values.connection_amps) : null,
      subpanel_count: values.subpanel_count ? Number(values.subpanel_count) : null,
      circuits_checked: values.circuits_checked ? Number(values.circuits_checked) : null,
      frequency_years: values.frequency_years ? Number(values.frequency_years) : null,
      thermal_test_done: values.thermal_test_done,
    });
  };

  return (
    <Card>
      <CardContent className="p-4">
        <form id="inspection-header-form" onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="לקוח" htmlFor="customer_id">
              <Controller
                name="customer_id"
                control={control}
                render={({ field }) => (
                  <Combobox
                    id="customer_id"
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                      // Fill the address from the customer's own record —
                      // only if nothing was typed there yet, so this never
                      // overwrites an address already entered by hand.
                      if (value && !getValues("address")) {
                        const customer = customers.find((c) => c.id === value);
                        if (customer?.address) setValue("address", customer.address);
                      }
                    }}
                    options={customers.map((c) => ({ value: c.id, label: c.name, sublabel: c.phone ?? undefined }))}
                    placeholder="בחר/י לקוח..."
                    emptyOptionLabel="ללא לקוח משויך"
                    actionLabel="+ לקוח חדש"
                    onAction={() => setQuickAddOpen(true)}
                  />
                )}
              />
            </FormField>
            <FormField label="כתובת" htmlFor="address">
              <Input id="address" {...register("address")} />
            </FormField>
            <FormField label="תאריך בדיקה" htmlFor="inspection_date">
              <Input id="inspection_date" type="date" {...register("inspection_date")} />
            </FormField>
            <FormField label="שם החשמלאי" htmlFor="electrician_name">
              <Input id="electrician_name" {...register("electrician_name")} />
            </FormField>
            <FormField label="מספר רישיון חשמלאי" htmlFor="electrician_license">
              <Input id="electrician_license" {...register("electrician_license")} />
            </FormField>
            <FormField label="גודל חיבור" htmlFor="connection_phase">
              <div className="flex items-center gap-2">
                <Controller
                  name="connection_phase"
                  control={control}
                  render={({ field }) => (
                    <StatusSelect
                      id="connection_phase"
                      className="flex-1"
                      aria-label="מספר פאזות"
                      showDot={false}
                      value={field.value}
                      onChange={field.onChange}
                      options={[
                        { value: "", label: "פאזות..." },
                        ...CONNECTION_PHASE_OPTIONS.map((o) => ({ value: o.value as string, label: o.label })),
                      ]}
                    />
                  )}
                />
                <Controller
                  name="connection_amps"
                  control={control}
                  render={({ field }) => (
                    <StatusSelect
                      id="connection_amps"
                      className="flex-1"
                      aria-label="אמפראז׳"
                      showDot={false}
                      value={field.value}
                      onChange={field.onChange}
                      options={[
                        { value: "", label: "אמפר..." },
                        ...CONNECTION_AMPS_OPTIONS.map((a) => ({ value: String(a), label: `${a}A` })),
                      ]}
                    />
                  )}
                />
                {sizeLabel && <span className="shrink-0 text-sm font-medium text-muted-foreground">{sizeLabel}</span>}
              </div>
            </FormField>
            <FormField label="מספר לוחות משנה" htmlFor="subpanel_count">
              <Input id="subpanel_count" type="number" {...register("subpanel_count")} />
            </FormField>
            <FormField label="מספר מעגלים שנבדקו" htmlFor="circuits_checked">
              <Input id="circuits_checked" type="number" {...register("circuits_checked")} />
            </FormField>
            <FormField label="תדירות עד הבדיקה הבאה (שנים)" htmlFor="frequency_years">
              <Input id="frequency_years" type="number" {...register("frequency_years")} />
            </FormField>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" {...register("thermal_test_done")} />
            בוצעה בדיקה תרמית/תרמוגרפית
          </label>

          {dueDate && (
            <p className="text-sm text-muted-foreground">
              תאריך יעד לבדיקה הבאה: <span className="font-medium text-foreground">{formatDate(dueDate.toISOString())}</span>
            </p>
          )}
          {/* The save button lives in the sticky bar above (via the `form`
              attribute pointing at this form's id) so it's reachable
              without scrolling back up — no separate button needed here. */}
        </form>
      </CardContent>

      {quickAddOpen && (
        <QuickAddCustomerModal
          onClose={() => setQuickAddOpen(false)}
          onCreated={(id) => {
            setValue("customer_id", id);
            setQuickAddOpen(false);
          }}
        />
      )}
    </Card>
  );
}

// `Number(raw) || undefined` (the previous version of these handlers) broke
// typing any value under 1: after typing just the leading "0" of "0.35",
// Number("0") is 0 — falsy — so it mapped to undefined and the controlled
// input snapped back to empty, wiping out what was being typed before the
// decimal point could even be entered. Handling the empty string
// separately (blank field → undefined, not 0) fixes that, since a
// measured Zs of "0" isn't a real reading anyway.
function parseOptionalNumber(raw: string): number | undefined {
  if (raw === "") return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

interface GroundingCalcPanelProps {
  initial: GroundingCalcState;
  onChange: (value: GroundingCalcState) => void;
}

// The Zs (loop impedance) calculation, inline under its checklist item —
// חברת חשמל דורשת שזרם התקלה יהיה גבוה פי 10 לפחות מזרם ההגנה (מא"ז), כדי
// להבטיח ניתוק מהיר: Zs מקסימלי = מתח ÷ (10 × מא"ז). The supply voltage is
// always 230V (חברת חשמל's standard low-voltage supply), so it's not a
// field here anymore — GROUNDING_SUPPLY_VOLTAGE is baked straight into the
// formula. "מהלוח עשוי" decides whether the main breaker counts toward
// "the highest breaker rating in the panel": on a plastic (non-conductive,
// the default) board the main is excluded, on a metal one it's included —
// breakerRatingLabel below reflects that choice in the field's own label.
// Saved on blur/change so typing a value doesn't fire a request per
// keystroke. The resulting pass/fail (via onChange, computed one level up
// against maxAllowedLoopImpedance) is what marks the checklist item — this
// panel itself only shows the number for reference.
function GroundingCalcPanel({ initial, onChange }: GroundingCalcPanelProps) {
  const [panelMaterial, setPanelMaterial] = React.useState<PanelMaterial>(initial.panel_material ?? "plastic");
  const [breakerRating, setBreakerRating] = React.useState(initial.breaker_rating);
  const [measuredValue, setMeasuredValue] = React.useState(initial.measured_value);

  const maxZs = maxAllowedLoopImpedance(GROUNDING_SUPPLY_VOLTAGE, breakerRating);
  const withinLimit = maxZs !== null && measuredValue !== undefined ? measuredValue <= maxZs : null;

  const commit = (patch: Partial<GroundingCalcState>) =>
    onChange({ panel_material: panelMaterial, breaker_rating: breakerRating, measured_value: measuredValue, ...patch });

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label="ממה הלוח עשוי" htmlFor="grounding_panel_material">
          <StatusSelect
            id="grounding_panel_material"
            showDot={false}
            value={panelMaterial}
            onChange={(value) => {
              setPanelMaterial(value);
              commit({ panel_material: value });
            }}
            options={PANEL_MATERIAL_OPTIONS.map((o) => ({ value: o.value as PanelMaterial, label: o.label }))}
          />
        </FormField>
        <FormField label={breakerRatingLabel(panelMaterial)} htmlFor="grounding_breaker">
          <Input
            id="grounding_breaker"
            type="number"
            placeholder="לדוגמה: 16"
            value={breakerRating ?? ""}
            onChange={(e) => setBreakerRating(parseOptionalNumber(e.target.value))}
            onBlur={() => commit({})}
          />
        </FormField>
        <FormField label="הערך שנמדד במכשיר הבדיקה (Ω)" htmlFor="grounding_measured">
          <Input
            id="grounding_measured"
            type="number"
            step="0.01"
            placeholder="לדוגמה: 0.35"
            value={measuredValue ?? ""}
            onChange={(e) => setMeasuredValue(parseOptionalNumber(e.target.value))}
            onBlur={() => commit({})}
          />
        </FormField>
      </div>
      {maxZs !== null && (
        <p className="mt-2 text-sm">
          Zs מקסימלי מותר: <span className="font-medium">{maxZs.toFixed(2)} Ω</span>
          {withinLimit !== null && (
            <span className={withinLimit ? "text-emerald-600" : "text-destructive"}>
              {" "}
              — {withinLimit ? "הערך הנמדד בתחום המותר — הצ׳ק ליסט סומן אוטומטית כתקין" : "הערך הנמדד חורג מהמותר — הצ׳ק ליסט סומן אוטומטית כלא תקין"}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

interface InsulationMeasurementPanelProps {
  initial: InsulationCalcState;
  onChange: (value: InsulationCalcState) => void;
}

// A place to record the insulation-resistance value read off the tester —
// just the number and which unit it was read in (kΩ or MΩ, whichever the
// tester happened to show), saved on blur/change. No threshold/pass-fail
// of its own like GroundingCalcPanel above: the question's own ✓/✗ buttons
// stay the way to mark it.
function InsulationMeasurementPanel({ initial, onChange }: InsulationMeasurementPanelProps) {
  const [unit, setUnit] = React.useState<InsulationUnit>(initial.unit ?? "mohm");
  const [measuredValue, setMeasuredValue] = React.useState(initial.measured_value);

  const commit = (patch: Partial<InsulationCalcState>) => onChange({ unit, measured_value: measuredValue, ...patch });

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="הערך שנמדד" htmlFor="insulation_measured_value">
          <Input
            id="insulation_measured_value"
            type="number"
            step="0.01"
            placeholder="לדוגמה: 2.5"
            value={measuredValue ?? ""}
            onChange={(e) => setMeasuredValue(parseOptionalNumber(e.target.value))}
            onBlur={() => commit({})}
          />
        </FormField>
        <FormField label="יחידה" htmlFor="insulation_unit">
          <StatusSelect
            id="insulation_unit"
            showDot={false}
            value={unit}
            onChange={(value) => {
              setUnit(value);
              commit({ unit: value });
            }}
            options={INSULATION_UNIT_OPTIONS.map((o) => ({ value: o.value as InsulationUnit, label: o.label }))}
          />
        </FormField>
      </div>
    </div>
  );
}

export interface CategoryFormProps {
  initial: ResourceCategory | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: ResourceCategoryInput) => void;
}

// Exported so ResourceLibraryPage can reuse it for the "+ קטגוריה חדשה"
// creation flow, which still happens inline on the list page — only
// viewing/editing an existing category moved to this detail page.
export function CategoryForm({ initial, submitting, error, onCancel, onSubmit }: CategoryFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResourceCategoryInput>({
    resolver: zodResolver(resourceCategorySchema),
    defaultValues: {
      name: initial?.name ?? "",
      notes: initial?.notes ?? "",
    },
  });

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField label="שם הקטגוריה" htmlFor="name" error={errors.name?.message}>
            <Input id="name" placeholder="למשל: בדיקות, טפסים..." {...register("name")} />
          </FormField>
          <FormField label="הערות / הנחיות (אופציונלי)" htmlFor="notes" error={errors.notes?.message}>
            <Textarea id="notes" rows={4} {...register("notes")} />
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
