import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerSchema, type CustomerInput, type Customer, strings } from "@repo/shared";
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
  Textarea,
} from "@repo/ui";
import { FormField } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";

export function CustomersPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<Customer | "new" | null>(null);
  const [search, setSearch] = React.useState("");

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: CustomerInput & { id?: string }) => {
      const { id, ...rest } = values;
      const payload = {
        name: rest.name,
        phone: rest.phone || null,
        email: rest.email || null,
        address: rest.address || null,
        notes: rest.notes || null,
      };
      if (id) {
        const { error } = await supabase.from("customers").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  const filtered = (customers ?? []).filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.name, c.phone, c.email].some((v) => v?.toLowerCase().includes(q));
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={strings.nav.customers}
        description="רשימת הלקוחות של העסק — חיפוש, יצירה ועריכה."
        action={
          <Button
            onClick={() => setEditing((current) => (current === "new" ? null : "new"))}
          >
            + לקוח חדש
          </Button>
        }
      />

      {editing && (
        <CustomerForm
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
            placeholder="חיפוש לפי שם, טלפון או אימייל..."
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
                  <TableHead>שם</TableHead>
                  <TableHead>טלפון</TableHead>
                  <TableHead>אימייל</TableHead>
                  <TableHead>כתובת</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead>{strings.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.phone ?? "—"}</TableCell>
                    <TableCell>{c.email ?? "—"}</TableCell>
                    <TableCell>{c.address ?? "—"}</TableCell>
                    <TableCell>
                      {c.pending_review ? (
                        <Badge variant="warning">ממתין לאימות</Badge>
                      ) : (
                        <Badge variant="success">מאומת</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(c)}>
                          {strings.common.edit}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm(`למחוק את הלקוח "${c.name}"?`)) remove.mutate(c.id);
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

interface CustomerFormProps {
  initial: Customer | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: CustomerInput) => void;
}

function CustomerForm({ initial, submitting, error, onCancel, onSubmit }: CustomerFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: initial?.name ?? "",
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
      address: initial?.address ?? "",
      notes: initial?.notes ?? "",
    },
  });

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="שם מלא" htmlFor="name" error={errors.name?.message}>
              <Input id="name" {...register("name")} />
            </FormField>
            <FormField label="טלפון" htmlFor="phone" error={errors.phone?.message}>
              <Input id="phone" {...register("phone")} />
            </FormField>
            <FormField label="אימייל" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" {...register("email")} />
            </FormField>
            <FormField label="כתובת" htmlFor="address" error={errors.address?.message}>
              <Input id="address" {...register("address")} />
            </FormField>
          </div>
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
