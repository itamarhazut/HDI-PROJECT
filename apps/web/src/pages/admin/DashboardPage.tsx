import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui";
import { supabase } from "../../lib/supabase";

interface Counts {
  openJobs: number;
  pendingQuotes: number;
  overdueInvoices: number;
  lowStockItems: number;
  pendingCustomers: number;
}

export function AdminDashboardPage() {
  const { data, isLoading } = useQuery<Counts>({
    queryKey: ["admin-dashboard-counts"],
    queryFn: async () => {
      const [openJobs, pendingQuotes, overdueInvoices, inventoryItems, pendingCustomers] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }).in("status", ["new", "scheduled", "in_progress"]),
        supabase.from("quotes").select("id", { count: "exact", head: true }).in("status", ["draft", "sent"]),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "overdue"),
        supabase.from("inventory_items").select("quantity_on_hand, reorder_threshold"),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("pending_review", true),
      ]);

      const lowStockItems = (inventoryItems.data ?? []).filter(
        (i) => i.reorder_threshold !== null && i.quantity_on_hand <= i.reorder_threshold
      ).length;

      return {
        openJobs: openJobs.count ?? 0,
        pendingQuotes: pendingQuotes.count ?? 0,
        overdueInvoices: overdueInvoices.count ?? 0,
        lowStockItems,
        pendingCustomers: pendingCustomers.count ?? 0,
      };
    },
  });

  const cards = [
    { label: "עבודות פתוחות", value: data?.openJobs },
    { label: "הצעות מחיר ממתינות", value: data?.pendingQuotes },
    { label: "חשבוניות באיחור", value: data?.overdueInvoices },
    { label: "פריטים במלאי נמוך", value: data?.lowStockItems },
    { label: "לקוחות ממתינים לאימות", value: data?.pendingCustomers },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">לוח בקרה</h1>
        <p className="text-sm text-muted-foreground">סיכום כללי של מצב העסק.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{isLoading ? "—" : card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
