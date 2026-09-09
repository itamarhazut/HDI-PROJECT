import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { leadSchema, type Lead, LEAD_STATUS_LABELS, strings } from "@repo/shared";
import {
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
import { StatusBadge } from "../../components/StatusBadge";
import { supabase } from "../../lib/supabase";

const leadFormSchema = leadSchema.extend({
  status: z.enum(["new", "contacted", "converted", "lost"]).optional(),
});
type LeadFormInput = z.infer<typeof leadFormSchema>;

export function LeadsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<Lead | "new" | null>(null);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: LeadFormInput & { id?: string }) => {
      const { id, status, ...rest } = values;
      const payload = {
        name: rest.name,
        phone: rest.phone || null,
        email: rest.email || null,
        source: rest.source || null,
        notes: rest.notes || null,
        ...(status ? { status } : {}),
      };
      if (id) {
        const { error } = await supabase.from("leads").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("leads").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  const convert = useMutation({
    mutationFn: async (lead: Lead) => {
      const { data: customer, error: custError } = await supabase
        .from("customers")
        .insert({ name: lead.name, phone: lead.phone, email: lead.email, notes: lead.notes })
        .select("id")
        .single();
      if (custError) throw custError;

      const { error: leadError } = await supabase
        .from("leads")
        .update({ status: "converted", converted_customer_id: customer.id })
        .eq("id", lead.id);
      if (leadError) throw leadError;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={strings.nav.leads}
        description="לידים משיווק — מעקב עד המרה ללקוח."
        action={<Button onClick={() => setEditing((c) => (c === "new" ? null : "new"))}>+ ליד חדש</Button>}
      />

      {editing && (
        <LeadForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          submitting={upsert.isPending}
          error={upsert.error instanceof Error ? upsert.error.message : null}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => upsert.mutate(editing === "new" ? values : { ...values, id: editing.id })}
        />
      )}

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <p className="text-muted-foreground">{strings.common.loading}</p>
          ) : (leads ?? []).length === 0 ? (
            <p className="text-muted-foreground">{strings.common.noResults}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שם</TableHead>
                  <TableHead>טלפון</TableHead>
                  <TableHead>מקור</TableHead>
                  <TableHead>{strings.common.status}</TableHead>
                  <TableHead>{strings.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(leads ?? []).map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.name}</TableCell>
                    <TableCell>{lead.phone ?? "—"}</TableCell>
                    <TableCell>{lead.source ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} label={LEAD_STATUS_LABELS[lead.status] ?? lead.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(lead)}>
                          {strings.common.edit}
                        </Button>
                        {lead.status !== "converted" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              if (confirm(`להמיר את "${lead.name}" ללקוח?`)) convert.mutate(lead);
                            }}
                          >
                            המרה ללקוח
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm(`למחוק את הליד "${lead.name}"?`)) remove.mutate(lead.id);
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

interface LeadFormProps {
  initial: Lead | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: LeadFormInput) => void;
}

function LeadForm({ initial, submitting, error, onCancel, onSubmit }: LeadFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LeadFormInput>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      name: initial?.name ?? "",
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
      source: initial?.source ?? "",
      notes: initial?.notes ?? "",
      status: initial?.status ?? "new",
    },
  });

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="שם" htmlFor="name" error={errors.name?.message}>
              <Input id="name" {...register("name")} />
            </FormField>
            <FormField label="טלפון" htmlFor="phone" error={errors.phone?.message}>
              <Input id="phone" {...register("phone")} />
            </FormField>
            <FormField label="אימייל" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" {...register("email")} />
            </FormField>
            <FormField label="מקור" htmlFor="source" error={errors.source?.message}>
              <Input id="source" placeholder="אתר, המלצה, פייסבוק..." {...register("source")} />
            </FormField>
            {initial && (
              <FormField label={strings.common.status} htmlFor="status" error={errors.status?.message}>
                <Select id="status" {...register("status")}>
                  {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
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
