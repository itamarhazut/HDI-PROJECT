import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui";
import { useAuth } from "../../auth/AuthProvider";
import { supabase } from "../../lib/supabase";

interface Counts {
  activeJobs: number;
  openQuotes: number;
  unpaidInvoices: number;
}

export function CustomerDashboardPage() {
  const { profile } = useAuth();

  const { data, isLoading } = useQuery<Counts>({
    queryKey: ["customer-dashboard-counts"],
    queryFn: async () => {
      // RLS scopes every one of these queries to the logged-in customer's
      // own rows automatically — no need to filter by customer_id here.
      const [activeJobs, openQuotes, unpaidInvoices] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }).in("status", ["new", "scheduled", "in_progress"]),
        supabase.from("quotes").select("id", { count: "exact", head: true }).in("status", ["draft", "sent"]),
        supabase.from("invoices").select("id", { count: "exact", head: true }).in("status", ["pending", "overdue"]),
      ]);

      return {
        activeJobs: activeJobs.count ?? 0,
        openQuotes: openQuotes.count ?? 0,
        unpaidInvoices: unpaidInvoices.count ?? 0,
      };
    },
  });

  const cards = [
    { label: "עבודות פעילות", value: data?.activeJobs },
    { label: "הצעות מחיר ממתינות", value: data?.openQuotes },
    { label: "חשבוניות לתשלום", value: data?.unpaidInvoices },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>ברוכים הבאים{profile?.full_name ? `, ${profile.full_name}` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          כאן יופיע סיכום העבודות, הצעות המחיר והחשבוניות שלך.
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
