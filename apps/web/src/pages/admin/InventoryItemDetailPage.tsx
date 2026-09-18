import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type InventoryItem,
  type InventoryItemInput,
  type InventoryReason,
  recordInventoryTransaction,
  strings,
} from "@repo/shared";
import { Badge, Button, Card, CardContent, useConfirmDialog, useToast } from "@repo/ui";
import { DetailToolbar } from "../../components/DetailToolbar";
import { PageHeader } from "../../components/PageHeader";
import { IconBox } from "../../components/icons";
import { formatCurrency } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";
import { AdjustStockForm, InventoryForm } from "./InventoryPage";

// The item card you land on after clicking a row in InventoryPage —
// viewing, editing, adjusting stock and deleting all happen here instead
// of inline in the list, so opening one item doesn't also show the rest of
// the inventory at the same time. Same split as CustomerDetailPage /
// JobDetailPage.
export function InventoryItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = React.useState(false);
  const [adjusting, setAdjusting] = React.useState(false);

  const { data: item, isLoading } = useQuery({
    queryKey: ["inventory_items", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_items").select("*").eq("id", id as string).single();
      if (error) throw error;
      return data as InventoryItem;
    },
    enabled: !!id,
  });

  const update = useMutation({
    mutationFn: async (values: InventoryItemInput) => {
      const { error } = await supabase
        .from("inventory_items")
        .update({
          sku: values.sku || null,
          name: values.name,
          category: values.category || null,
          unit: values.unit,
          reorder_threshold: values.reorder_threshold ?? null,
          unit_cost: values.unit_cost ?? null,
          notes: values.notes || null,
        })
        .eq("id", id as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory_items", id] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      setEditing(false);
      toast({ title: "הפריט נשמר בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת הפריט נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const adjust = useMutation({
    mutationFn: async (values: { quantityDelta: number; reason: InventoryReason }) => {
      await recordInventoryTransaction(supabase, {
        inventoryItemId: id as string,
        jobId: null,
        quantityDelta: values.quantityDelta,
        reason: values.reason,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory_items", id] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      setAdjusting(false);
      toast({ title: "המלאי עודכן בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "עדכון המלאי נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("inventory_items").delete().eq("id", id as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      toast({ title: "הפריט נמחק", variant: "success" });
      navigate("/admin/inventory");
    },
    onError: (err) => toast({ title: "מחיקת הפריט נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">{strings.common.loading}</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">הפריט לא נמצא.</p>
      </div>
    );
  }

  const low = item.reorder_threshold !== null && item.quantity_on_hand <= item.reorder_threshold;

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
              <Button type="submit" form="inventory-form" size="sm" disabled={update.isPending}>
                {strings.common.save}
              </Button>
            </>
          )}
          {adjusting && (
            <>
              <Button variant="outline" size="sm" onClick={() => setAdjusting(false)}>
                {strings.common.cancel}
              </Button>
              <Button type="submit" form="adjust-stock-form" size="sm" disabled={adjust.isPending}>
                {strings.common.save}
              </Button>
            </>
          )}
          {!editing && !adjusting && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                {strings.common.edit}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAdjusting(true)}>
                התאמת מלאי
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: "מחיקת פריט מלאי",
                    description: `למחוק את הפריט "${item.name}"? הפעולה אינה הפיכה.`,
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
      <PageHeader title={item.name} description="פריט מלאי." icon={IconBox} color="bg-rose-500" />

      {editing ? (
        <InventoryForm
          initial={item}
          submitting={update.isPending}
          error={update.error instanceof Error ? update.error.message : null}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => update.mutate(values)}
        />
      ) : adjusting ? (
        <AdjustStockForm
          item={item}
          submitting={adjust.isPending}
          error={adjust.error instanceof Error ? adjust.error.message : null}
          onCancel={() => setAdjusting(false)}
          onSubmit={(values) => adjust.mutate(values)}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {item.quantity_on_hand} {item.unit} במלאי
              </span>
              {low && <Badge variant="destructive">מלאי נמוך</Badge>}
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">מק״ט</dt>
                <dd className="text-sm font-medium">{item.sku ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">קטגוריה</dt>
                <dd className="text-sm font-medium">{item.category ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">יחידת מידה</dt>
                <dd className="text-sm font-medium">{item.unit}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">סף להתראת מלאי נמוך</dt>
                <dd className="text-sm font-medium">{item.reorder_threshold ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">עלות ליחידה</dt>
                <dd className="text-sm font-medium">{item.unit_cost != null ? formatCurrency(item.unit_cost) : "—"}</dd>
              </div>
            </dl>

            {item.notes && (
              <div>
                <p className="text-xs text-muted-foreground">הערות</p>
                <p className="whitespace-pre-wrap text-sm">{item.notes}</p>
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
    <Link to="/admin/inventory" className="text-sm font-medium text-muted-foreground hover:text-foreground">
      ‹ {strings.common.back} למלאי
    </Link>
  );
}
