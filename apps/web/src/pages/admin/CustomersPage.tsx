import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  TableSkeleton,
  Textarea,
  useToast,
} from "@repo/ui";
import { FormField } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { DetailToolbar } from "../../components/DetailToolbar";
import { StatusSelect } from "../../components/StatusSelect";
import { IconUsers } from "../../components/icons";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";

// The list itself only browses/creates — every row is a compact link into
// its own page (CustomerDetailPage), which is where viewing/editing a
// customer, verifying them, and deleting them actually happens. Same
// "compact list → its own detail page" split as ResourceLibraryPage /
// ResourceCategoryDetailPage, so clicking a customer doesn't have to share
// screen space with the rest of the list.
export function CustomersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState("");
  // Read from the URL (not local-only state) so the dashboard's "לקוחות
  // ממתינים לאימות" card can link straight here with `?verification=pending`
  // and land already filtered.
  const [searchParams, setSearchParams] = useSearchParams();
  const verificationFilter: "all" | "pending" = searchParams.get("verification") === "pending" ? "pending" : "all";

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (values: CustomerInput) => {
      const payload = {
        name: values.name,
        document_name: values.document_name || null,
        business_id: values.business_id || null,
        phone: values.phone || null,
        mobile_phone: values.mobile_phone || null,
        email: values.email || null,
        address: values.address || null,
        city: values.city || null,
        notes: values.notes || null,
      };
      const { error } = await supabase.from("customers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      setCreating(false);
      toast({ title: "הלקוח נשמר בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת הלקוח נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const filtered = (customers ?? []).filter((c) => {
    if (verificationFilter === "pending" && !c.pending_review) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.name, c.phone, c.email, c.business_id].some((v) => v?.toLowerCase().includes(q));
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Pinned like every detail page's DetailToolbar — see QuotesPage.tsx
          for the full reasoning. */}
      <DetailToolbar>
        <span className="text-sm font-medium text-muted-foreground">{strings.nav.customers}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setCreating((v) => !v)}>+ לקוח חדש</Button>
        </div>
      </DetailToolbar>
      <PageHeader
        title={strings.nav.customers}
        description="רשימת הלקוחות של העסק — חיפוש ויצירה. לחיצה על לקוח פותחת את כרטיס הלקוח."
        icon={IconUsers}
        color="bg-teal-500"
      />

      {creating && (
        <CustomerForm
          initial={null}
          submitting={create.isPending}
          error={create.error instanceof Error ? create.error.message : null}
          onCancel={() => setCreating(false)}
          onSubmit={(values) => create.mutate(values)}
        />
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              placeholder="חיפוש לפי שם, טלפון או אימייל..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <StatusSelect
              aria-label="סינון לפי סטטוס אימות"
              className="sm:w-56"
              showDot={false}
              value={verificationFilter}
              onChange={(next) =>
                setSearchParams(next === "pending" ? { verification: "pending" } : {}, { replace: true })
              }
              options={[
                { value: "all" as const, label: "כל הלקוחות" },
                { value: "pending" as const, label: "ממתינים לאימות בלבד" },
              ]}
            />
          </div>
          {isLoading ? (
            <TableSkeleton columns={5} />
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    onClick={() => navigate(`/admin/customers/${c.id}`)}
                    className="cursor-pointer"
                  >
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

// Exported so CustomerDetailPage can reuse the exact same fields/validation
// for editing an existing customer — this list page only ever uses it for
// creating a new one.
export function CustomerForm({ initial, submitting, error, onCancel, onSubmit }: CustomerFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: initial?.name ?? "",
      document_name: initial?.document_name ?? "",
      business_id: initial?.business_id ?? "",
      phone: initial?.phone ?? "",
      mobile_phone: initial?.mobile_phone ?? "",
      email: initial?.email ?? "",
      address: initial?.address ?? "",
      city: initial?.city ?? "",
      notes: initial?.notes ?? "",
    },
  });

  return (
    <Card>
      <CardContent className="p-4">
        {/* id lets CustomerDetailPage's fixed DetailToolbar submit this form
            with a `form="customer-form"` button while editing, so "שמור" is
            reachable without scrolling all the way down here first — same
            pattern as InspectionHeaderForm's sticky bar (see
            ResourceCategoryDetailPage) and QuoteForm's "quote-form". */}
        <form id="customer-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="שם מלא" htmlFor="name" error={errors.name?.message}>
              <Input id="name" {...register("name")} />
            </FormField>
            <FormField label="שם למסמכים" htmlFor="document_name" error={errors.document_name?.message}>
              <Input id="document_name" placeholder="לדוגמה: שם החברה, אם שונה משם הלקוח" {...register("document_name")} />
            </FormField>
            <FormField label="מספר עוסק או ח.פ" htmlFor="business_id" error={errors.business_id?.message}>
              <Input id="business_id" {...register("business_id")} />
            </FormField>
            <FormField label="טלפון" htmlFor="phone" error={errors.phone?.message}>
              <Input id="phone" {...register("phone")} />
            </FormField>
            <FormField label="טלפון נייד" htmlFor="mobile_phone" error={errors.mobile_phone?.message}>
              <Input id="mobile_phone" {...register("mobile_phone")} />
            </FormField>
            <FormField label="אימייל" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" {...register("email")} />
            </FormField>
            <FormField label="כתובת" htmlFor="address" error={errors.address?.message}>
              <Input id="address" {...register("address")} />
            </FormField>
            <FormField label="ישוב" htmlFor="city" error={errors.city?.message}>
              <Input id="city" {...register("city")} />
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
