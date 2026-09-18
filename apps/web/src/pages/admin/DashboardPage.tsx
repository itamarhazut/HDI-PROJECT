import { useMemo, type ComponentType, type SVGProps } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui";
import { QUOTE_STATUS_LABELS, type QuoteStatus, MARKETING_POST_PLATFORM_LABELS } from "@repo/shared";
import { formatCurrency, formatDate } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { JobsCalendar } from "../../components/JobsCalendar";
import { PageHeader } from "../../components/PageHeader";
import { useGoogleCalendarEvents } from "../../hooks/useGoogleCalendarSync";
import {
  IconBox,
  IconCalendarSync,
  IconClipboardCheck,
  IconDashboard,
  IconFileText,
  IconMegaphone,
  IconReceipt,
  IconTrendingUp,
  IconUsers,
  IconWallet,
} from "../../components/icons";

const todayEventTimeFormatter = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" });

function IconBadge({ color, icon: Icon }: { color: string; icon: ComponentType<SVGProps<SVGSVGElement>> }) {
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
      <Icon className="h-[18px] w-[18px] text-white" />
    </span>
  );
}

const QUOTE_STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "rejected", "expired"];

// How many months back the revenue chart shows, current month included.
const REVENUE_CHART_MONTHS = 6;

interface OverdueInvoiceRow {
  id: string;
  customerName: string;
  /** Outstanding balance, not the invoice's original total. */
  amount: number;
  dueDate: string | null;
}

interface LowStockRow {
  id: string;
  name: string;
  quantity_on_hand: number;
  reorder_threshold: number | null;
}

interface UpcomingJobRow {
  id: string;
  title: string;
  customerName: string;
  scheduled_date: string;
}

interface UpcomingPostRow {
  id: string;
  title: string;
  platform: string;
  scheduled_date: string;
}

interface RevenueMonthPoint {
  label: string;
  amount: number;
}

interface DashboardData {
  openJobs: number;
  jobsCompletedThisMonth: number;
  pendingCustomers: number;
  revenueThisMonth: number;
  expensesThisMonth: number;
  revenueByMonth: RevenueMonthPoint[];
  overdueInvoices: OverdueInvoiceRow[];
  lowStockItems: LowStockRow[];
  quotePipeline: Record<QuoteStatus, number>;
  upcomingJobs: UpcomingJobRow[];
  newLeadsThisWeek: number;
  upcomingPosts: UpcomingPostRow[];
}

// "YYYY-MM-DD" for today in local time — same key format JobsCalendar
// uses, so the request below asks the Edge Function for exactly one
// calendar day.
function todayDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AdminDashboardPage() {
  const todayKey = useMemo(() => todayDateKey(), []);
  // One-way synced phone/Google Calendar events for today only — see
  // SettingsPage's "סנכרון עם יומן Google" card and JobsCalendar, which
  // shows the same events (plus the rest of the month) as a small blue
  // dot per day. This surfaces just today's, front and center, per the
  // user's request that today's synced event(s) stand out rather than
  // requiring a click into the calendar widget below.
  const { data: todayEvents } = useGoogleCalendarEvents(todayKey, todayKey);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now);
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const chartStart = new Date(startOfMonth);
      chartStart.setMonth(chartStart.getMonth() - (REVENUE_CHART_MONTHS - 1));

      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const sevenDaysAhead = new Date(today);
      sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);
      const todayStr = today.toISOString().slice(0, 10);
      const sevenDaysAheadStr = sevenDaysAhead.toISOString().slice(0, 10);

      const [
        openJobsRes,
        completedJobsRes,
        overdueInvoicesRes,
        inventoryRes,
        pendingCustomersRes,
        quotesRes,
        paidInvoicesRes,
        upcomingJobsRes,
        newLeadsRes,
        upcomingPostsRes,
        expensesThisMonthRes,
      ] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true }).in("status", ["new", "scheduled", "in_progress"]),
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed")
          .gte("completed_at", startOfMonth.toISOString()),
        // Overdue is a fact about the due date and the balance, not a flag
        // someone remembered to set — an invoice is late the moment its due
        // date passes while money is still owed. Asking the question that
        // way means this card is right without anything sweeping the table
        // overnight.
        supabase
          .from("invoices")
          .select("id, amount, amount_paid, due_date, customers(name)")
          .not("status", "in", "(paid,cancelled)")
          .lt("due_date", todayStr)
          .order("due_date", { ascending: true })
          .limit(5),
        supabase.from("inventory_items").select("id, name, quantity_on_hand, reorder_threshold"),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("pending_review", true),
        supabase.from("quotes").select("status"),
        supabase
          .from("invoices")
          .select("amount, paid_date")
          .eq("status", "paid")
          .gte("paid_date", chartStart.toISOString().slice(0, 10)),
        supabase
          .from("jobs")
          .select("id, title, scheduled_date, customers(name)")
          .gte("scheduled_date", todayStr)
          .lte("scheduled_date", sevenDaysAheadStr)
          .not("status", "in", "(completed,cancelled)")
          .order("scheduled_date", { ascending: true })
          .limit(6),
        supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo.toISOString()),
        supabase
          .from("marketing_posts")
          .select("id, title, platform, scheduled_date")
          .eq("status", "scheduled")
          .gte("scheduled_date", todayStr)
          .order("scheduled_date", { ascending: true })
          .limit(4),
        supabase
          .from("expenses")
          .select("amount")
          .gte("expense_date", startOfMonth.toISOString().slice(0, 10)),
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
        amount_paid: number | null;
        due_date: string | null;
        customers: { name: string } | null;
      }>).map((inv) => ({
        id: inv.id,
        customerName: inv.customers?.name ?? "—",
        // What's actually still owed, so a partly-paid invoice doesn't
        // shout its original figure.
        amount: Math.max(0, Math.round((inv.amount - Number(inv.amount_paid ?? 0)) * 100) / 100),
        dueDate: inv.due_date,
      }));

      const upcomingJobs = ((upcomingJobsRes.data ?? []) as unknown as Array<{
        id: string;
        title: string;
        scheduled_date: string;
        customers: { name: string } | null;
      }>).map((job) => ({
        id: job.id,
        title: job.title,
        customerName: job.customers?.name ?? "—",
        scheduled_date: job.scheduled_date,
      }));

      const upcomingPosts = ((upcomingPostsRes.data ?? []) as UpcomingPostRow[]) ?? [];

      // Bucket every paid invoice into its "YYYY-MM" month, then build one
      // point per month in chartStart..now order (including empty months,
      // so a quiet month reads as a real zero-height bar, not a gap).
      const paidByMonthKey = new Map<string, number>();
      ((paidInvoicesRes.data ?? []) as Array<{ amount: number; paid_date: string | null }>).forEach((inv) => {
        if (!inv.paid_date) return;
        const key = inv.paid_date.slice(0, 7);
        paidByMonthKey.set(key, (paidByMonthKey.get(key) ?? 0) + inv.amount);
      });

      const revenueByMonth: RevenueMonthPoint[] = [];
      const monthCursor = new Date(chartStart);
      for (let i = 0; i < REVENUE_CHART_MONTHS; i++) {
        const key = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}`;
        revenueByMonth.push({
          label: new Intl.DateTimeFormat("he-IL", { month: "short" }).format(monthCursor),
          amount: paidByMonthKey.get(key) ?? 0,
        });
        monthCursor.setMonth(monthCursor.getMonth() + 1);
      }

      const currentMonthKey = `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, "0")}`;
      const revenueThisMonth = paidByMonthKey.get(currentMonthKey) ?? 0;

      const expensesThisMonth = ((expensesThisMonthRes.data ?? []) as Array<{ amount: number }>).reduce(
        (sum, e) => sum + e.amount,
        0
      );

      return {
        openJobs: openJobsRes.count ?? 0,
        jobsCompletedThisMonth: completedJobsRes.count ?? 0,
        pendingCustomers: pendingCustomersRes.count ?? 0,
        revenueThisMonth,
        expensesThisMonth,
        revenueByMonth,
        overdueInvoices,
        lowStockItems,
        quotePipeline,
        upcomingJobs,
        newLeadsThisWeek: newLeadsRes.count ?? 0,
        upcomingPosts,
      };
    },
  });

  // Every card below links straight to the filtered list it summarizes —
  // "עבודות פתוחות" and "עבודות שהושלמו" pass `?status=...` that JobsPage
  // reads to pre-filter its table, and "לקוחות ממתינים לאימות" passes
  // `?verification=pending` that CustomersPage reads the same way. The
  // dashboard is meant to be a jumping-off point, not just a read-only
  // summary.
  const cards = [
    { label: "עבודות פתוחות", value: data?.openJobs, icon: IconClipboardCheck, color: "bg-amber-500", to: "/admin/jobs?status=open" },
    {
      label: "עבודות שהושלמו החודש",
      value: data?.jobsCompletedThisMonth,
      icon: IconClipboardCheck,
      color: "bg-emerald-500",
      to: "/admin/jobs?status=completed",
    },
    {
      label: "הכנסות החודש",
      value: data ? formatCurrency(data.revenueThisMonth) : undefined,
      icon: IconTrendingUp,
      color: "bg-teal-600",
      to: "/admin/quotes?tab=invoices",
    },
    {
      label: "הוצאות החודש",
      value: data ? formatCurrency(data.expensesThisMonth) : undefined,
      icon: IconWallet,
      color: "bg-rose-600",
      to: "/admin/expenses",
    },
    {
      label: "לקוחות ממתינים לאימות",
      value: data?.pendingCustomers,
      icon: IconUsers,
      color: "bg-violet-500",
      to: "/admin/customers?verification=pending",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="לוח בקרה" description="סיכום כללי של מצב העסק." icon={IconDashboard} color="bg-indigo-500" />

      {/* Only rendered when there's actually something to show — today's
          synced phone/Google Calendar event(s), front and center above
          the stat cards, per the user's request that these stand out
          instead of only appearing as a small dot inside the calendar
          widget below. Hidden entirely on a day with nothing synced, so
          it never sits there empty. */}
      {todayEvents && todayEvents.length > 0 && (
        <Card className="border-sky-200 bg-sky-50/60">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <IconBadge color="bg-sky-500" icon={IconCalendarSync} />
              <div>
                <p className="text-sm font-semibold">היום ביומן המסונכרן</p>
                <p className="text-xs text-muted-foreground">אירועים מהטלפון שנרשמו להיום</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {todayEvents.map((ev) => (
                <span
                  key={ev.id}
                  className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-800"
                >
                  {ev.title}
                  {!ev.allDay && <span className="text-sky-600"> · {todayEventTimeFormatter.format(new Date(ev.start))}</span>}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Five cards, one row on a normal desktop width (lg+) — the whole
          point is that they sit snugly above JobsCalendar below, not wrap
          into an orphaned single card on its own line. Padding/text sizes
          are trimmed a notch from the plain 4-column layout this replaced,
          since five columns leaves each card noticeably narrower. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <Link key={card.label} to={card.to} className="block">
            <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 p-4">
                <CardTitle className="text-xs font-medium leading-tight text-muted-foreground sm:text-sm">
                  {card.label}
                </CardTitle>
                <IconBadge color={card.color} icon={card.icon} />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-2xl font-bold">{isLoading ? "—" : card.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <JobsCalendar />

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            הכנסות לפי חודש (חשבוניות ששולמו)
          </CardTitle>
          <IconBadge color="bg-teal-600" icon={IconTrendingUp} />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">טוען...</p>
          ) : (
            <RevenueBarChart data={data?.revenueByMonth ?? []} />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">עבודות קרובות (7 ימים)</CardTitle>
            <IconBadge color="bg-sky-500" icon={IconClipboardCheck} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">טוען...</p>
            ) : data && data.upcomingJobs.length > 0 ? (
              <div className="flex flex-col gap-2">
                {data.upcomingJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between text-sm">
                    <span>
                      {job.title} <span className="text-muted-foreground">— {job.customerName}</span>
                    </span>
                    <span className="shrink-0 font-medium text-muted-foreground">{formatDate(job.scheduled_date)}</span>
                  </div>
                ))}
                <Link to="/admin/jobs" className="mt-1 text-xs text-primary underline">
                  לכל העבודות ←
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">אין עבודות מתוזמנות בשבוע הקרוב.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">לידים ותוכן שיווקי</CardTitle>
            <IconBadge color="bg-fuchsia-500" icon={IconMegaphone} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">טוען...</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">לידים חדשים ב-7 הימים האחרונים</span>
                  <span className="font-semibold">{data?.newLeadsThisWeek ?? 0}</span>
                </div>
                {data && data.upcomingPosts.length > 0 ? (
                  <div className="flex flex-col gap-2 border-t border-border pt-2">
                    <p className="text-xs text-muted-foreground">פוסטים מתוזמנים קרובים:</p>
                    {data.upcomingPosts.map((post) => (
                      <div key={post.id} className="flex items-center justify-between text-sm">
                        <span>
                          {post.title}{" "}
                          <span className="text-muted-foreground">
                            ({MARKETING_POST_PLATFORM_LABELS[post.platform] ?? post.platform})
                          </span>
                        </span>
                        <span className="shrink-0 font-medium text-muted-foreground">{formatDate(post.scheduled_date)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="border-t border-border pt-2 text-xs text-muted-foreground">אין פוסטים מתוזמנים כרגע.</p>
                )}
                <Link to="/admin/leads" className="text-xs text-primary underline">
                  ללידים ולתוכן השיווקי ←
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
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
                    <span>
                      {inv.customerName}
                      {inv.dueDate && (
                        <span className="text-xs text-muted-foreground"> · {formatDate(inv.dueDate)}</span>
                      )}
                    </span>
                    <span className="font-semibold text-destructive">{formatCurrency(inv.amount)}</span>
                  </div>
                ))}
                <Link to="/admin/quotes?tab=invoices" className="mt-1 text-xs text-primary underline">
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

// Dependency-free bar chart (plain SVG) — deliberately not pulling in a
// charting library just for one bar chart; keeps this in the same
// hand-rolled-SVG style as the icon set (components/icons.tsx).
const CHART_VIEW_WIDTH = 600;
const CHART_VIEW_HEIGHT = 160;
const CHART_BASELINE = 130;
const CHART_MAX_BAR_HEIGHT = 110;

function RevenueBarChart({ data }: { data: RevenueMonthPoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">אין עדיין נתונים להצגה.</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.amount));
  const slot = CHART_VIEW_WIDTH / data.length;
  const barWidth = slot * 0.5;

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${CHART_VIEW_WIDTH} ${CHART_VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label="הכנסות לפי חודש"
      >
        <line x1="0" y1={CHART_BASELINE} x2={CHART_VIEW_WIDTH} y2={CHART_BASELINE} className="stroke-border" strokeWidth="1" />
        {data.map((point, i) => {
          const barHeight = point.amount > 0 ? Math.max(3, (point.amount / max) * CHART_MAX_BAR_HEIGHT) : 0;
          const x = i * slot + (slot - barWidth) / 2;
          const y = CHART_BASELINE - barHeight;
          return (
            <g key={`${point.label}-${i}`}>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx="4" className="fill-primary">
                <title>
                  {point.label}: {formatCurrency(point.amount)}
                </title>
              </rect>
              {point.amount > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={y - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {formatCurrency(point.amount)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex text-xs text-muted-foreground">
        {data.map((point, i) => (
          <span key={`${point.label}-${i}`} style={{ width: `${100 / data.length}%` }} className="text-center">
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}
