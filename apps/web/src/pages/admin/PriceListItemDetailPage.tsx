import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type PriceListItem, type PriceListItemInput, strings } from "@repo/shared";
import { Badge, Button, Card, CardContent, useConfirmDialog, useToast } from "@repo/ui";
import { DetailToolbar } from "../../components/DetailToolbar";
import { PageHeader } from "../../components/PageHeader";
import { IconTag } from "../../components/icons";
import { formatCurrency } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";
import { PriceListForm } from "./PriceListPage";

// The item card you land on after clicking a row in PriceListPage —
// viewing, editing and deleting all happen here instead of inline in the
// list, so opening one item doesn't also show the rest of the price list
// at the same time. Same split as CustomerDetailPage / JobDetailPage.
export function PriceListItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = React.useState(false);

  const { data: item, isLoading } = useQuery({
    queryKey: ["price_list_items", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("price_list_items").select("*").eq("id", id as string).single();
      if (error) throw error;
      return data as PriceListItem;
    },
    enabled: !!id,
  });

  const update = useMutation({
    mutationFn: async (values: PriceListItemInput) => {
      const payload = {
        code: values.code || null,
        name: values.name,
        category: values.category || null,
        unit: values.unit,
        unit_price: values.unit_price,
        default_cost: values.default_cost ?? null,
        is_active: values.is_active,
      };
      const { error } = await supabase.from("price_list_items").update(payload).eq("id", id as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["price_list_items", id] });
      void queryClient.invalidateQueries({ queryKey: ["price_list_items"] });
      setEditing(false);
      toast({ title: "הפריט נשמר בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת הפריט נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("price_list_items").delete().eq("id", id as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["price_list_items"] });
      toast({ title: "הפריט נמחק", variant: "success" });
      navigate("/admin/price-list");
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
              <Button type="submit" form="price-list-form" size="sm" disabled={update.isPending}>
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
                    title: "מחיקת פריט מחירון",
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
      <PageHeader title={item.name} description="פריט מחירון." icon={IconTag} color="bg-violet-500" />

      {editing ? (
        <PriceListForm
          initial={item}
          submitting={update.isPending}
          error={update.error instanceof Error ? update.error.message : null}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => update.mutate(values)}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <div>
              {item.is_active ? <Badge variant="success">פעיל</Badge> : <Badge variant="secondary">לא פעיל</Badge>}
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">קוד</dt>
                <dd className="text-sm font-medium">{item.code ?? "—"}</dd>
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
                <dt className="text-xs text-muted-foreground">מחיר ליחידה</dt>
                <dd className="text-sm font-medium">{formatCurrency(item.unit_price)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">עלות ברירת מחדל</dt>
                <dd className="text-sm font-medium">{item.default_cost != null ? formatCurrency(item.default_cost) : "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/admin/price-list" className="text-sm font-medium text-muted-foreground hover:text-foreground">
      ‹ {strings.common.back} למחירון
    </Link>
  );
}
