import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  inventoryItemSchema,
  type InventoryItemInput,
  type InventoryItem,
  type InventoryReason,
  recordInventoryTransaction,
  strings,
} from "@repo/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
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
import { StatusSelect } from "../../components/StatusSelect";
import { IconBox } from "../../components/icons";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";

export const REASON_LABELS: Record<InventoryReason, string> = {
  job_usage: "שימוש בעבודה",
  restock: "חידוש מלאי",
  adjustment: "תיקון ידני",
};

// The list itself only browses/creates — every row is a compact link into
// its own page (InventoryItemDetailPage), which is where viewing/editing/
// deleting an item actually happens. "התאמת מלאי" (stock adjustment) stays
// as a quick action right here in the row, since it's the single most
// common thing done from this list — same idea as JobsPage keeping
// "סיום עבודה" as a row quick-action even after editing moved to its own
// detail page.
export function InventoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = React.useState(false);
  const [adjusting, setAdjusting] = React.useState<InventoryItem | null>(null);
  const [search, setSearch] = React.useState("");

  const { data: items, isLoading } = useQuery({
    queryKey: ["inventory_items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_items").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (values: InventoryItemInput) => {
      const { error } = await supabase.from("inventory_items").insert({
        sku: values.sku || null,
        name: values.name,
        category: values.category || null,
        unit: values.unit,
        quantity_on_hand: values.quantity_on_hand,
        reorder_threshold: values.reorder_threshold ?? null,
        unit_cost: values.unit_cost ?? null,
        notes: values.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      setCreating(false);
      toast({ title: "הפריט נשמר בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת הפריט נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const adjust = useMutation({
    mutationFn: async (values: { inventoryItemId: string; quantityDelta: number; reason: InventoryReason }) => {
      await recordInventoryTransaction(supabase, {
        inventoryItemId: values.inventoryItemId,
        jobId: null,
        quantityDelta: values.quantityDelta,
        reason: values.reason,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      setAdjusting(null);
      toast({ title: "המלאי עודכן בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "עדכון המלאי נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  const filtered = (items ?? []).filter((i) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [i.name, i.sku, i.category].some((v) => v?.toLowerCase().includes(q));
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Pinned like every detail page's DetailToolbar — see QuotesPage.tsx
          for the full reasoning. */}
      <DetailToolbar>
        <span className="text-sm font-medium text-muted-foreground">{strings.nav.inventory}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setCreating((v) => !v)}>+ פריט חדש</Button>
        </div>
      </DetailToolbar>
      <PageHeader
        title={strings.nav.inventory}
        description="מלאי ציוד וחומרים — כמות במלאי מתעדכנת רק דרך פעולת 'התאמת מלאי'."
        icon={IconBox}
        color="bg-rose-500"
      />

      {creating && (
        <InventoryForm
          initial={null}
          submitting={create.isPending}
          error={create.error instanceof Error ? create.error.message : null}
          onCancel={() => setCreating(false)}
          onSubmit={(values) => create.mutate(values)}
        />
      )}

      {adjusting && (
        <AdjustStockForm
          item={adjusting}
          submitting={adjust.isPending}
          error={adjust.error instanceof Error ? adjust.error.message : null}
          onCancel={() => setAdjusting(null)}
          onSubmit={(values) => adjust.mutate({ inventoryItemId: adjusting.id, ...values })}
        />
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <Input
            placeholder="חיפוש לפי שם, מק״ט או קטגוריה..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          {isLoading ? (
            <TableSkeleton columns={5} />
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground">{strings.common.noResults}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>מק״ט</TableHead>
                  <TableHead>שם</TableHead>
                  <TableHead>קטגוריה</TableHead>
                  <TableHead>כמות במלאי</TableHead>
                  <TableHead>{strings.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((i) => {
                  const low = i.reorder_threshold !== null && i.quantity_on_hand <= i.reorder_threshold;
                  return (
                    <TableRow
                      key={i.id}
                      onClick={() => navigate(`/admin/inventory/${i.id}`)}
                      className="cursor-pointer"
                    >
                      <TableCell>{i.sku ?? "—"}</TableCell>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell>{i.category ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>
                            {i.quantity_on_hand} {i.unit}
                          </span>
                          {low && <Badge variant="destructive">מלאי נמוך</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* stopPropagation — this button sits inside a row
                            that navigates to the item's page on click, but
                            "התאמת מלאי" is a quick action that should stay
                            right here instead of also opening that page. */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAdjusting(i);
                          }}
                        >
                          התאמת מלאי
                        </Button>
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

export interface InventoryFormProps {
  initial: InventoryItem | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: InventoryItemInput) => void;
}

// Exported so InventoryItemDetailPage can reuse the exact same fields/
// validation for editing an existing item — this list page only ever uses
// it for creating a new one.
export function InventoryForm({ initial, submitting, error, onCancel, onSubmit }: InventoryFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InventoryItemInput>({
    resolver: zodResolver(inventoryItemSchema),
    defaultValues: {
      sku: initial?.sku ?? "",
      name: initial?.name ?? "",
      category: initial?.category ?? "",
      unit: initial?.unit ?? "יח׳",
      quantity_on_hand: initial?.quantity_on_hand ?? 0,
      reorder_threshold: initial?.reorder_threshold ?? undefined,
      unit_cost: initial?.unit_cost ?? undefined,
      notes: initial?.notes ?? "",
    },
  });

  return (
    <Card>
      <CardContent className="p-4">
        {/* id lets InventoryItemDetailPage's fixed DetailToolbar submit this
            form with a `form="inventory-form"` button while editing, so
            "שמור" is reachable without scrolling all the way down here first
            — same pattern as InspectionHeaderForm's sticky bar (see
            ResourceCategoryDetailPage) and QuoteForm's "quote-form". */}
        <form id="inventory-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="מק״ט" htmlFor="sku" error={errors.sku?.message}>
              <Input id="sku" {...register("sku")} />
            </FormField>
            <FormField label="שם פריט" htmlFor="name" error={errors.name?.message} className="sm:col-span-2 flex flex-col gap-1.5">
              <Input id="name" {...register("name")} />
            </FormField>
            <FormField label="קטגוריה" htmlFor="category" error={errors.category?.message}>
              <Input id="category" {...register("category")} />
            </FormField>
            <FormField label="יחידת מידה" htmlFor="unit" error={errors.unit?.message}>
              <Input id="unit" {...register("unit")} />
            </FormField>
            {!initial && (
              <FormField label="כמות התחלתית" htmlFor="quantity_on_hand" error={errors.quantity_on_hand?.message}>
                <Input id="quantity_on_hand" type="number" step="0.01" {...register("quantity_on_hand")} />
              </FormField>
            )}
            <FormField label="סף להתראת מלאי נמוך" htmlFor="reorder_threshold" error={errors.reorder_threshold?.message}>
              <Input id="reorder_threshold" type="number" step="0.01" {...register("reorder_threshold")} />
            </FormField>
            <FormField label="עלות ליחידה (₪)" htmlFor="unit_cost" error={errors.unit_cost?.message}>
              <Input id="unit_cost" type="number" step="0.01" {...register("unit_cost")} />
            </FormField>
          </div>
          <FormField label="הערות" htmlFor="notes" error={errors.notes?.message}>
            <Textarea id="notes" {...register("notes")} />
          </FormField>
          {initial && (
            <p className="text-sm text-muted-foreground">
              לשינוי הכמות במלאי יש להשתמש בפעולת &ldquo;התאמת מלאי&rdquo; בטבלה, כדי לשמור היסטוריית תנועות.
            </p>
          )}
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

const adjustSchema = z.object({
  quantityDelta: z.coerce.number().refine((v) => v !== 0, "יש להזין כמות שונה מאפס"),
  reason: z.enum(["job_usage", "restock", "adjustment"]),
});
type AdjustInput = z.infer<typeof adjustSchema>;

export interface AdjustStockFormProps {
  item: InventoryItem;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: { quantityDelta: number; reason: InventoryReason }) => void;
}

// Exported so InventoryItemDetailPage can offer the same "התאמת מלאי" action
// from the item's own page, not only from the list row.
export function AdjustStockForm({ item, submitting, error, onCancel, onSubmit }: AdjustStockFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<AdjustInput>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { quantityDelta: 0, reason: "restock" },
  });

  return (
    <Card>
      <CardContent className="p-4">
        <p className="mb-4 text-sm text-muted-foreground">
          התאמת מלאי עבור <span className="font-medium text-foreground">{item.name}</span> — כמות נוכחית:{" "}
          {item.quantity_on_hand} {item.unit}. הזן/י מספר חיובי להוספה, שלילי להפחתה.
        </p>
        {/* id lets InventoryItemDetailPage's fixed DetailToolbar submit this
            form with a `form="adjust-stock-form"` button, same pattern as
            "inventory-form" above. */}
        <form id="adjust-stock-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="שינוי בכמות" htmlFor="quantityDelta" error={errors.quantityDelta?.message}>
              <Input id="quantityDelta" type="number" step="0.01" {...register("quantityDelta")} />
            </FormField>
            <FormField label="סיבה" htmlFor="reason" error={errors.reason?.message}>
              <Controller
                name="reason"
                control={control}
                render={({ field }) => (
                  <StatusSelect
                    id="reason"
                    showDot={false}
                    value={field.value}
                    onChange={field.onChange}
                    options={Object.entries(REASON_LABELS).map(([value, label]) => ({
                      value: value as InventoryReason,
                      label,
                    }))}
                  />
                )}
              />
            </FormField>
          </div>
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
