import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ResourceCategoryInput, type ResourceFile, strings } from "@repo/shared";
import { Button, useToast } from "@repo/ui";
import { PageHeader } from "../../components/PageHeader";
import { DetailToolbar } from "../../components/DetailToolbar";
import { IconChevronDown } from "../../components/icons";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";
import { CategoryForm } from "./ResourceCategoryDetailPage";
import iecLogo from "../../assets/iec-logo.png";

// A "library" of reference material organized by the outside authority it
// relates to — starting with just "חברת חשמל" (Israel Electric Corporation),
// since that's the one the business owner deals with constantly (connection
// approvals, required tests, forms).
//
// This list page only browses/creates categories — every row is a compact
// link (name + a one-line summary + a chevron) into its own page
// (ResourceCategoryDetailPage), which is where viewing/editing/deleting a
// category and its files actually happens, or — for "צ׳ק ליסט בדיקה" —
// where the full interactive checklist lives. Keeping the list itself
// compact matters here specifically: a category's content can be a whole
// checklist, not just a couple of lines, so expanding every category
// inline (as an earlier version of this page did) made the list unusably
// long.
//
// This is intentionally NOT built as a generic "categories per authority"
// system (no separate table for חברת חשמל / עירייה / etc.) — just this one
// flat list of categories, with the "חברת חשמל" heading and its logo
// hard-coded below. If a second authority is wanted later, that's a
// natural (small) extension of this same table.
export function ResourceLibraryPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = React.useState(false);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["resource_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: files } = useQuery({
    queryKey: ["resource_files"],
    queryFn: async () => {
      const { data, error } = await supabase.from("resource_files").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const fileCountByCategory = React.useMemo(() => {
    const map = new Map<string, number>();
    (files ?? []).forEach((f: ResourceFile) => map.set(f.category_id, (map.get(f.category_id) ?? 0) + 1));
    return map;
  }, [files]);

  const createCategory = useMutation({
    mutationFn: async (values: ResourceCategoryInput) => {
      const nextOrder = categories?.length ?? 0;
      const { error } = await supabase
        .from("resource_categories")
        .insert({ name: values.name, notes: values.notes || null, sort_order: nextOrder });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resource_categories"] });
      setCreating(false);
      toast({ title: "הקטגוריה נשמרה בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת הקטגוריה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Pinned like every detail page's DetailToolbar — see QuotesPage.tsx
          for the full reasoning. */}
      <DetailToolbar>
        <span className="text-sm font-medium text-muted-foreground">{strings.nav.resourceLibrary}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setCreating((v) => !v)}>+ קטגוריה חדשה</Button>
        </div>
      </DetailToolbar>
      <PageHeader
        title={strings.nav.resourceLibrary}
        description="מידע, הנחיות וטפסים לעבודה מול חברת חשמל."
        logoSrc={iecLogo}
        logoAlt="חברת החשמל"
      />

      {creating && (
        <CategoryForm
          initial={null}
          submitting={createCategory.isPending}
          error={createCategory.error instanceof Error ? createCategory.error.message : null}
          onCancel={() => setCreating(false)}
          onSubmit={(values) => createCategory.mutate(values)}
        />
      )}

      {isLoading ? (
        <p className="text-muted-foreground">{strings.common.loading}</p>
      ) : (categories ?? []).length === 0 ? (
        <p className="text-muted-foreground">{strings.common.noResults}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {(categories ?? []).map((category) => {
            // Checklist categories (e.g. "בדיקות") don't show a subtitle at
            // all — no "X מתוך Y סומנו" progress count. The checklist is a
            // personal on-site tool, not a tracked-to-completion form, so a
            // completion count on the list row would be misleading.
            const subtitle = category.is_checklist ? null : `${fileCountByCategory.get(category.id) ?? 0} קבצים`;
            return (
              <Link
                key={category.id}
                to={`/admin/resources/${category.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:bg-accent"
              >
                <div>
                  <p className="font-semibold">{category.name}</p>
                  {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
                </div>
                <IconChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
