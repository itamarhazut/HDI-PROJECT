import { useQuery } from "@tanstack/react-query";
import { INVOICE_STATUS_LABELS, strings } from "@repo/shared";
import { Card, CardContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { formatCurrency, formatDate } from "../../lib/format";
import { supabase } from "../../lib/supabase";

export function MyInvoicesPage() {
  // RLS (invoices_select_own) scopes this to the logged-in customer's own invoices.
  const { data: invoices, isLoading } = useQuery({
    queryKey: ["my-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={strings.nav.myInvoices} description="חשבוניות שהופקו עבורך." />
      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <p className="text-muted-foreground">{strings.common.loading}</p>
          ) : (invoices ?? []).length === 0 ? (
            <p className="text-muted-foreground">{strings.common.noResults}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>מס׳</TableHead>
                  <TableHead>סכום</TableHead>
                  <TableHead>{strings.common.status}</TableHead>
                  <TableHead>תאריך</TableHead>
                  <TableHead>קישור</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invoices ?? []).map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>#{inv.invoice_number}</TableCell>
                    <TableCell>{formatCurrency(inv.amount)}</TableCell>
                    <TableCell>
                      <StatusBadge status={inv.status} label={INVOICE_STATUS_LABELS[inv.status] ?? inv.status} />
                    </TableCell>
                    <TableCell>{formatDate(inv.issued_date)}</TableCell>
                    <TableCell>
                      {inv.external_url ? (
                        <a href={inv.external_url} target="_blank" rel="noreferrer" className="text-primary underline">
                          פתיחה
                        </a>
                      ) : (
                        "—"
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
