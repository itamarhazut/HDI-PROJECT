import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Customer, type CustomerInput, strings } from "@repo/shared";
import { Badge, Button, Card, CardContent, useConfirmDialog, useToast } from "@repo/ui";
import { DetailToolbar } from "../../components/DetailToolbar";
import { PageHeader } from "../../components/PageHeader";
import { IconUsers } from "../../components/icons";
import { getErrorMessage } from "../../lib/errors";
import { formatDate } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { CustomerForm } from "./CustomersPage";

// The "customer card" you land on after clicking a row in CustomersPage —
// viewing, editing, verifying and deleting all happen here instead of
// inline in the list, so opening one customer doesn't also show the rest
// of the list at the same time.
export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = React.useState(false);

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customers", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", id as string).single();
      if (error) throw error;
      return data as Customer;
    },
    enabled: !!id,
  });

  const update = useMutation({
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
      const { error } = await supabase.from("customers").update(payload).eq("id", id as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers", id] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditing(false);
      toast({ title: "הלקוח נשמר בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת הלקוח נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const setVerification = useMutation({
    mutationFn: async (pending_review: boolean) => {
      const { error } = await supabase.from("customers").update({ pending_review }).eq("id", id as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers", id] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "סטטוס האימות עודכן", variant: "success" });
    },
    onError: (err) => toast({ title: "עדכון סטטוס האימות נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customers").delete().eq("id", id as string);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "הלקוח נמחק", variant: "success" });
      navigate("/admin/customers");
    },
    onError: (err) => toast({ title: "מחיקת הלקוח נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">{strings.common.loading}</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <p className="text-muted-foreground">הלקוח לא נמצא.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <DetailToolbar>
        <Link to="/admin/customers" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          ‹ {strings.common.back} ללקוחות
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Pinned Cancel/Save while editing — the form's own buttons sit
              at the bottom of the form, so without this they'd only be
              reachable after scrolling all the way down. Save submits the
              form by id (same pattern as InspectionHeaderForm's sticky
              bar). */}
          {editing && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                {strings.common.cancel}
              </Button>
              <Button type="submit" form="customer-form" size="sm" disabled={update.isPending}>
                {strings.common.save}
              </Button>
            </>
          )}
          {!editing && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                {strings.common.edit}
              </Button>
              {customer.pending_review ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={setVerification.isPending}
                  onClick={() => setVerification.mutate(false)}
                >
                  אימות לקוח
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={setVerification.isPending}
                  onClick={() => setVerification.mutate(true)}
                >
                  בטל אימות
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: "מחיקת לקוח",
                    description: `למחוק את הלקוח "${customer.name}"? הפעולה אינה הפיכה.`,
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
      <PageHeader title={customer.name} description="כרטיס לקוח." icon={IconUsers} color="bg-teal-500" />

      {editing ? (
        <CustomerForm
          initial={customer}
          submitting={update.isPending}
          error={update.error instanceof Error ? update.error.message : null}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => update.mutate(values)}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <div>
              {customer.pending_review ? (
                <Badge variant="warning">ממתין לאימות</Badge>
              ) : (
                <Badge variant="success">מאומת</Badge>
              )}
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">שם למסמכים</dt>
                <dd className="text-sm font-medium">{customer.document_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">מספר עוסק / ח.פ</dt>
                <dd className="text-sm font-medium">{customer.business_id ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">טלפון</dt>
                <dd className="text-sm font-medium">{customer.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">טלפון נייד</dt>
                <dd className="text-sm font-medium">{customer.mobile_phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">אימייל</dt>
                <dd className="text-sm font-medium">{customer.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">כתובת</dt>
                <dd className="text-sm font-medium">{customer.address ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">ישוב</dt>
                <dd className="text-sm font-medium">{customer.city ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">לקוח מתאריך</dt>
                <dd className="text-sm font-medium">{formatDate(customer.created_at)}</dd>
              </div>
            </dl>

            {customer.notes && (
              <div>
                <p className="text-xs text-muted-foreground">הערות</p>
                <p className="whitespace-pre-wrap text-sm">{customer.notes}</p>
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
    <Link to="/admin/customers" className="text-sm font-medium text-muted-foreground hover:text-foreground">
      ‹ {strings.common.back} ללקוחות
    </Link>
  );
}
