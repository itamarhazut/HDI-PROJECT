import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { priceListItemSchema, type PriceListItemInput, type PriceListItem, strings } from "@repo/shared";
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
  useToast,
} from "@repo/ui";
import { FormField } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { DetailToolbar } from "../../components/DetailToolbar";
import { IconTag } from "../../components/icons";
import { formatCurrency } from "../../lib/format";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";

// The list itself only browses/creates — every row is a compact link into
// its own page (PriceListItemDetailPage), which is where viewing/editing/
// deleting an item actually happens. Same "compact list → its own detail
// page" split as CustomersPage / JobsPage, so clicking an item doesn't have
// to share screen space with the rest of the list.
export function PriceListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const { data: items, isLoading } = useQuery({
    queryKey: ["price_list_items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("price_list_items").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
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
      const { error } = await supabase.from("price_list_items").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["price_list_items"] });
      setCreating(false);
      toast({ title: "הפריט נשמר בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת הפריט נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const filtered = (items ?? []).filter((i) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [i.name, i.code, i.category].some((v) => v?.toLowerCase().includes(q));
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Pinned like every detail page's DetailToolbar — see QuotesPage.tsx
          for the full reasoning. */}
      <DetailToolbar>
        <span className="text-sm font-medium text-muted-foreground">{strings.nav.priceList}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setCreating((v) => !v)}>+ פריט חדש</Button>
        </div>
      </DetailToolbar>
      <PageHeader
        title={strings.nav.priceList}
        description="מחירון הציוד והשירותים — משמש לבניית הצעות מחיר."
        icon={IconTag}
        color="bg-violet-500"
      />

      {creating && (
        <PriceListForm
          initial={null}
          submitting={create.isPending}
          error={create.error instanceof Error ? create.error.message : null}
          onCancel={() => setCreating(false)}
          onSubmit={(values) => create.mutate(values)}
        />
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <Input
            placeholder="חיפוש לפי שם, קוד או קטגוריה..."
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
                  <TableHead>קוד</TableHead>
                  <TableHead>שם</TableHead>
                  <TableHead>קטגוריה</TableHead>
                  <TableHead>יחידה</TableHead>
                  <TableHead>מחיר</TableHead>
                  <TableHead>{strings.common.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((i) => (
                  <TableRow key={i.id} onClick={() => navigate(`/admin/price-list/${i.id}`)} className="cursor-pointer">
                    <TableCell>{i.code ?? "—"}</TableCell>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell>{i.category ?? "—"}</TableCell>
                    <TableCell>{i.unit}</TableCell>
                    <TableCell>{formatCurrency(i.unit_price)}</TableCell>
                    <TableCell>
                      {i.is_active ? <Badge variant="success">פעיל</Badge> : <Badge variant="secondary">לא פעיל</Badge>}
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

export interface PriceListFormProps {
  initial: PriceListItem | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: PriceListItemInput) => void;
}

// Exported so PriceListItemDetailPage can reuse the exact same fields/
// validation for editing an existing item — this list page only ever uses
// it for creating a new one.
export function PriceListForm({ initial, submitting, error, onCancel, onSubmit }: PriceListFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PriceListItemInput>({
    resolver: zodResolver(priceListItemSchema),
    defaultValues: {
      code: initial?.code ?? "",
      name: initial?.name ?? "",
      category: initial?.category ?? "",
      unit: initial?.unit ?? "יח׳",
      unit_price: initial?.unit_price ?? 0,
      default_cost: initial?.default_cost ?? undefined,
      is_active: initial?.is_active ?? true,
    },
  });

  return (
    <Card>
      <CardContent className="p-4">
        {/* id lets PriceListItemDetailPage's fixed DetailToolbar submit this
            form with a `form="price-list-form"` button while editing, so
            "שמור" is reachable without scrolling all the way down here first
            — same pattern as InspectionHeaderForm's sticky bar (see
            ResourceCategoryDetailPage) and QuoteForm's "quote-form". */}
        <form id="price-list-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="קוד" htmlFor="code" error={errors.code?.message}>
              <Input id="code" {...register("code")} />
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
            <FormField label="מחיר ליחידה (₪)" htmlFor="unit_price" error={errors.unit_price?.message}>
              <Input id="unit_price" type="number" step="0.01" {...register("unit_price")} />
            </FormField>
            <FormField label="עלות ברירת מחדל (₪)" htmlFor="default_cost" error={errors.default_cost?.message}>
              <Input id="default_cost" type="number" step="0.01" {...register("default_cost")} />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("is_active")} className="h-4 w-4" />
            פעיל (מוצג בבניית הצעות מחיר)
          </label>
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
