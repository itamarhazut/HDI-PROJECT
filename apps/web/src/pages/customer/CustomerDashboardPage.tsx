import type { ComponentType, SVGProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui";
import { useAuth } from "../../auth/AuthProvider";
import { supabase } from "../../lib/supabase";
import { IconClipboardCheck, IconFileText, IconReceipt } from "../../components/icons";

function IconBadge({ color, icon: Icon }: { color: string; icon: ComponentType<SVGProps<SVGSVGElement>> }) {
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
      <Icon className="h-[18px] w-[18px] text-white" />
    </span>
  );
}

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
    { label: "עבודות פעילות", value: data?.activeJobs, icon: IconClipboardCheck, color: "bg-teal-500" },
    { label: "הצעות מחיר ממתינות", value: data?.openQuotes, icon: IconFileText, color: "bg-amber-500" },
    { label: "חשבוניות לתשלום", value: data?.unpaidInvoices, icon: IconReceipt, color: "bg-rose-500" },
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
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
              <IconBadge color={card.color} icon={card.icon} />
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
