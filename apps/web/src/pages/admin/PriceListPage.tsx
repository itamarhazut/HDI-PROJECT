import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
} from "@repo/ui";
import { FormField } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { formatCurrency } from "../../lib/format";
import { supabase } from "../../lib/supabase";

export function PriceListPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<PriceListItem | "new" | null>(null);
  const [search, setSearch] = React.useState("");

  const { data: items, isLoading } = useQuery({
    queryKey: ["price_list_items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("price_list_items").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: PriceListItemInput & { id?: string }) => {
      const { id, ...rest } = values;
      const payload = {
        code: rest.code || null,
        name: rest.name,
        category: rest.category || null,
        unit: rest.unit,
        unit_price: rest.unit_price,
        default_cost: rest.default_cost ?? null,
        is_active: rest.is_active,
      };
      if (id) {
        const { error } = await supabase.from("price_list_items").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("price_list_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["price_list_items"] });
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("price_list_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["price_list_items"] }),
  });

  const filtered = (items ?? []).filter((i) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [i.name, i.code, i.category].some((v) => v?.toLowerCase().includes(q));
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={strings.nav.priceList}
        description="מחירון הציוד והשירותים — משמש לבניית הצעות מחיר."
        action={<Button onClick={() => setEditing((c) => (c === "new" ? null : "new"))}>+ פריט חדש</Button>}
      />

      {editing && (
        <PriceListForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          submitting={upsert.isPending}
          error={upsert.error instanceof Error ? upsert.error.message : null}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => upsert.mutate(editing === "new" ? values : { ...values, id: editing.id })}
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
            <p className="text-muted-foreground">{strings.common.loading}</p>
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
                  <TableHead>{strings.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.code ?? "—"}</TableCell>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell>{i.category ?? "—"}</TableCell>
                    <TableCell>{i.unit}</TableCell>
                    <TableCell>{formatCurrency(i.unit_price)}</TableCell>
                    <TableCell>
                      {i.is_active ? <Badge variant="success">פעיל</Badge> : <Badge variant="secondary">לא פעיל</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface PriceListFormProps {
  initial: PriceListItem | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: PriceListItemInput) => void;
}

function PriceListForm({ initial, submitting, error, onCancel, onSubmit }: PriceListFormProps) {
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
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
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
