import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { supabase } from "../../lib/supabase";

const REASON_LABELS: Record<InventoryReason, string> = {
  job_usage: "שימוש בעבודה",
  restock: "חידוש מלאי",
  adjustment: "תיקון ידני",
};

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<InventoryItem | "new" | null>(null);
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

  const upsert = useMutation({
    mutationFn: async (values: InventoryItemInput & { id?: string }) => {
      const { id, ...rest } = values;
      if (id) {
        const { error } = await supabase
          .from("inventory_items")
          .update({
            sku: rest.sku || null,
            name: rest.name,
            category: rest.category || null,
            unit: rest.unit,
            reorder_threshold: rest.reorder_threshold ?? null,
            unit_cost: rest.unit_cost ?? null,
            notes: rest.notes || null,
          })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("inventory_items").insert({
          sku: rest.sku || null,
          name: rest.name,
          category: rest.category || null,
          unit: rest.unit,
          quantity_on_hand: rest.quantity_on_hand,
          reorder_threshold: rest.reorder_threshold ?? null,
          unit_cost: rest.unit_cost ?? null,
          notes: rest.notes || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["inventory_items"] }),
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
    },
  });

  const filtered = (items ?? []).filter((i) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [i.name, i.sku, i.category].some((v) => v?.toLowerCase().includes(q));
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={strings.nav.inventory}
        description="מלאי ציוד וחומרים — כמות במלאי מתעדכנת רק דרך פעולת 'התאמת מלאי'."
        action={<Button onClick={() => setEditing((c) => (c === "new" ? null : "new"))}>+ פריט חדש</Button>}
      />

      {editing && (
        <InventoryForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          submitting={upsert.isPending}
          error={upsert.error instanceof Error ? upsert.error.message : null}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => upsert.mutate(editing === "new" ? values : { ...values, id: editing.id })}
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
            <p className="text-muted-foreground">{strings.common.loading}</p>
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
                    <TableRow key={i.id}>
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
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setAdjusting(i)}>
                            התאמת מלאי
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setEditing(i)}>
                            {strings.common.edit}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (confirm(`למחוק את הפריט "${i.name}"?`)) remove.mutate(i.id);
                            }}
                          >
                            {strings.common.delete}
                          </Button>
                        </div>
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

interface InventoryFormProps {
  initial: InventoryItem | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: InventoryItemInput) => void;
}

function InventoryForm({ initial, submitting, error, onCancel, onSubmit }: InventoryFormProps) {
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
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
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

interface AdjustStockFormProps {
  item: InventoryItem;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: { quantityDelta: number; reason: InventoryReason }) => void;
}

function AdjustStockForm({ item, submitting, error, onCancel, onSubmit }: AdjustStockFormProps) {
  const {
    register,
    handleSubmit,
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
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="שינוי בכמות" htmlFor="quantityDelta" error={errors.quantityDelta?.message}>
              <Input id="quantityDelta" type="number" step="0.01" {...register("quantityDelta")} />
            </FormField>
            <FormField label="סיבה" htmlFor="reason" error={errors.reason?.message}>
              <Select id="reason" {...register("reason")}>
                {Object.entries(REASON_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
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
