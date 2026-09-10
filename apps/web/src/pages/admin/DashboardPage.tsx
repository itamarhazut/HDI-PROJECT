import type { ComponentType, SVGProps } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui";
import { QUOTE_STATUS_LABELS, type QuoteStatus } from "@repo/shared";
import { formatCurrency } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { PageHeader } from "../../components/PageHeader";
import { IconBox, IconClipboardCheck, IconDashboard, IconFileText, IconReceipt, IconUsers } from "../../components/icons";

function IconBadge({ color, icon: Icon }: { color: string; icon: ComponentType<SVGProps<SVGSVGElement>> }) {
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
      <Icon className="h-[18px] w-[18px] text-white" />
    </span>
  );
}

const QUOTE_STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "rejected", "expired"];

interface OverdueInvoiceRow {
  id: string;
  customerName: string;
  amount: number;
}

interface LowStockRow {
  id: string;
  name: string;
  quantity_on_hand: number;
  reorder_threshold: number | null;
}

interface DashboardData {
  openJobs: number;
  jobsCompletedThisMonth: number;
  pendingCustomers: number;
  overdueInvoices: OverdueInvoiceRow[];
  lowStockItems: LowStockRow[];
  quotePipeline: Record<QuoteStatus, number>;
}

export function AdminDashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [openJobsRes, completedJobsRes, overdueInvoicesRes, inventoryRes, pendingCustomersRes, quotesRes] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }).in("status", ["new", "scheduled", "in_progress"]),
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed")
          .gte("completed_at", startOfMonth.toISOString()),
        supabase
          .from("invoices")
          .select("id, amount, customers(name)")
          .eq("status", "overdue")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("inventory_items").select("id, name, quantity_on_hand, reorder_threshold"),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("pending_review", true),
        supabase.from("quotes").select("status"),
      ]);

      const lowStockItems = (inventoryRes.data ?? [])
        .filter((i) => i.reorder_threshold !== null && i.quantity_on_hand <= i.reorder_threshold)
        .slice(0, 5);

      const quotePipeline = QUOTE_STATUSES.reduce(
        (acc, status) => {
          acc[status] = 0;
          return acc;
        },
        {} as Record<QuoteStatus, number>
      );
      (quotesRes.data ?? []).forEach((q) => {
        if (q.status in quotePipeline) quotePipeline[q.status as QuoteStatus] += 1;
      });

      // Embedded `customers(name)` selects come back untyped (see the
      // Relationships: [] note in packages/shared/types/database.ts) —
      // the FK still resolves correctly at runtime, we just narrow it here.
      const overdueInvoices = ((overdueInvoicesRes.data ?? []) as unknown as Array<{
        id: string;
        amount: number;
        customers: { name: string } | null;
      }>).map((inv) => ({
        id: inv.id,
        customerName: inv.customers?.name ?? "—",
        amount: inv.amount,
      }));

      return {
        openJobs: openJobsRes.count ?? 0,
        jobsCompletedThisMonth: completedJobsRes.count ?? 0,
        pendingCustomers: pendingCustomersRes.count ?? 0,
        overdueInvoices,
        lowStockItems,
        quotePipeline,
      };
    },
  });

  const cards = [
    { label: "עבודות פתוחות", value: data?.openJobs, icon: IconClipboardCheck, color: "bg-amber-500" },
    { label: "עבודות שהושלמו החודש", value: data?.jobsCompletedThisMonth, icon: IconClipboardCheck, color: "bg-emerald-500" },
    { label: "לקוחות ממתינים לאימות", value: data?.pendingCustomers, icon: IconUsers, color: "bg-violet-500" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="לוח בקרה" description="סיכום כללי של מצב העסק." icon={IconDashboard} color="bg-indigo-500" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">צנרת הצעות מחיר</CardTitle>
            <IconBadge color="bg-indigo-500" icon={IconFileText} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">טוען...</p>
            ) : (
              <div className="flex flex-col gap-2">
                {QUOTE_STATUSES.map((status) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{QUOTE_STATUS_LABELS[status]}</span>
                    <span className="font-semibold">{data?.quotePipeline[status] ?? 0}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              חשבוניות באיחור {data && data.overdueInvoices.length > 0 && `(${data.overdueInvoices.length})`}
            </CardTitle>
            <IconBadge color="bg-rose-500" icon={IconReceipt} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">טוען...</p>
            ) : data && data.overdueInvoices.length > 0 ? (
              <div className="flex flex-col gap-2">
                {data.overdueInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between text-sm">
                    <span>{inv.customerName}</span>
                    <span className="font-semibold text-destructive">{formatCurrency(inv.amount)}</span>
                  </div>
                ))}
                <Link to="/admin/invoices" className="mt-1 text-xs text-primary underline">
                  לכל החשבוניות ←
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">אין חשבוניות באיחור כרגע.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              פריטים במלאי נמוך {data && data.lowStockItems.length > 0 && `(${data.lowStockItems.length})`}
            </CardTitle>
            <IconBadge color="bg-orange-500" icon={IconBox} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">טוען...</p>
            ) : data && data.lowStockItems.length > 0 ? (
              <div className="flex flex-col gap-2">
                {data.lowStockItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span>{item.name}</span>
                    <span className="font-semibold text-accent-foreground">
                      {item.quantity_on_hand} / {item.reorder_threshold}
                    </span>
                  </div>
                ))}
                <Link to="/admin/inventory" className="mt-1 text-xs text-primary underline">
                  לכל המלאי ←
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">אין פריטים במלאי נמוך כרגע.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
