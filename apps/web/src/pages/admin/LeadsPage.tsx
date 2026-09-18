import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  leadSchema,
  marketingPostSchema,
  type Lead,
  type MarketingPost,
  type LeadStatus,
  type MarketingPostPlatform,
  type MarketingPostStatus,
  LEAD_STATUS_LABELS,
  MARKETING_POST_STATUS_LABELS,
  MARKETING_POST_PLATFORM_LABELS,
  strings,
} from "@repo/shared";
import {
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
  cn,
  useConfirmDialog,
  useToast,
} from "@repo/ui";
import { FormField } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { StatusSelect } from "../../components/StatusSelect";
import { IconFileText, IconMegaphone, IconPhone, IconWhatsApp } from "../../components/icons";
import { getErrorMessage } from "../../lib/errors";
import { formatDate } from "../../lib/format";
import { toTelHref, toWhatsAppPhone } from "../../lib/phone";
import { supabase } from "../../lib/supabase";

const leadFormSchema = leadSchema.extend({
  status: z.enum(["new", "contacted", "converted", "lost"]).optional(),
});
type LeadFormInput = z.infer<typeof leadFormSchema>;

// "לידים ושיווק" — two tabs in one page rather than a separate nav item,
// since the sidebar label already covers both: tracking leads through to
// conversion (unchanged, below), and planning social-media content
// (new — see MarketingTab). There's no real Facebook/Instagram auto-posting
// here on purpose: that requires the business owner to set up a Meta
// developer/business account first, which is a separate step for later —
// this tab is just a planning/tracking board for what to post.
type LeadsTab = "leads" | "marketing";

export function LeadsPage() {
  const [tab, setTab] = React.useState<LeadsTab>("leads");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={strings.nav.leads}
        description="לידים משיווק ותכנון תוכן לרשתות החברתיות."
        icon={IconMegaphone}
        color="bg-fuchsia-500"
      />

      <div className="flex gap-2 border-b border-border">
        <TabButton active={tab === "leads"} onClick={() => setTab("leads")} icon={IconMegaphone}>
          לידים
        </TabButton>
        <TabButton active={tab === "marketing"} onClick={() => setTab("marketing")} icon={IconFileText}>
          תוכן שיווקי
        </TabButton>
      </div>

      {tab === "leads" ? <LeadsTabContent /> : <MarketingTabContent />}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
}

function TabButton({ active, onClick, icon: Icon, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 border-b-2 px-3 pb-2 text-sm font-medium transition-colors",
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

const normalizePhoneForMatch = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "").replace(/^972/, "0").replace(/^0*/, "");
  return digits.length >= 7 ? digits : null;
};

// Before turning a lead into a customer, check whether one already exists
// with the same phone (the reliable signal) or, failing that, the exact
// same name — so "המרה ללקוח" doesn't silently create a second record for
// someone already in the system under a slightly different lead entry.
function findDuplicateCustomer(
  lead: Lead,
  customers: { id: string; name: string; phone: string | null }[]
): { id: string; name: string; phone: string | null } | null {
  const leadPhone = normalizePhoneForMatch(lead.phone);
  if (leadPhone) {
    const byPhone = customers.find((c) => normalizePhoneForMatch(c.phone) === leadPhone);
    if (byPhone) return byPhone;
  }
  const leadName = lead.name.trim().toLowerCase();
  if (leadName) {
    const byName = customers.find((c) => c.name.trim().toLowerCase() === leadName);
    if (byName) return byName;
  }
  return null;
}

function LeadsTabContent() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = React.useState<Lead | "new" | null>(null);

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<LeadStatus | "all">("all");

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Only for the "does a customer like this already exist" check before
  // converting a lead — not shown anywhere on this page.
  const { data: existingCustomers } = useQuery({
    queryKey: ["customers", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name, phone");
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
        next_follow_up_date: rest.next_follow_up_date || null,
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
      toast({ title: "הליד נשמר בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת הליד נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "הליד נמחק", variant: "success" });
    },
    onError: (err) => toast({ title: "מחיקת הליד נכשלה", description: getErrorMessage(err), variant: "error" }),
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
      toast({ title: "הליד הומר ללקוח בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "המרת הליד ללקוח נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  // Wrapped in its own useMemo (not a bare `leads ?? []`) so its reference
  // stays stable across renders when `leads` hasn't changed — otherwise the
  // `?? []` fallback would be a *new* empty array every render, which broke
  // the bySource useMemo below (its dependency would "change" every time).
  const leadList = React.useMemo(() => leads ?? [], [leads]);

  // A quick "by source" breakdown (אתר / המלצה / פייסבוק...) — the
  // "מעקב על הלידים" part of the request beyond the table itself: at a
  // glance, which channels are actually bringing leads in. Skipped entirely
  // when there's nothing to summarize yet.
  const bySource = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leadList) {
      const key = lead.source?.trim() || "לא צוין";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [leadList]);

  const filteredLeads = leadList.filter((lead) => {
    if (statusFilter !== "all" && lead.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [lead.name, lead.phone, lead.email, lead.source].some((v) => v?.toLowerCase().includes(q));
  });

  // Today as an ISO date string, for the same plain-string comparison the
  // dashboard already uses for "due today/overdue" — a follow-up date is
  // only ever a bare date, never a time, so lexicographic comparison of
  // "YYYY-MM-DD" strings sorts correctly without parsing into a Date.
  const todayStr = new Date().toISOString().slice(0, 10);

  const handleConvert = async (lead: Lead) => {
    const duplicate = findDuplicateCustomer(lead, existingCustomers ?? []);
    const ok = await confirmDialog({
      title: "המרת ליד ללקוח",
      description: duplicate
        ? `כבר קיים לקוח עם אותו ${duplicate.phone && normalizePhoneForMatch(duplicate.phone) === normalizePhoneForMatch(lead.phone) ? "מספר טלפון" : "שם"}: "${duplicate.name}"${duplicate.phone ? ` (${duplicate.phone})` : ""}. להמיר בכל זאת וליצור רשומת לקוח נוספת?`
        : `להמיר את "${lead.name}" ללקוח?`,
      confirmLabel: duplicate ? "המרה בכל זאת" : "המרה",
      variant: duplicate ? "destructive" : "default",
    });
    if (ok) convert.mutate(lead);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button onClick={() => setEditing((c) => (c === "new" ? null : "new"))}>+ ליד חדש</Button>
      </div>

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

      {bySource.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap gap-2 p-4">
            {bySource.map(([source, count]) => (
              <span key={source} className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                {source}: {count}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              placeholder="חיפוש לפי שם, טלפון, אימייל או מקור..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <StatusSelect
              aria-label="סינון לפי סטטוס"
              className="sm:w-48"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all" as const, label: "כל הסטטוסים" },
                ...Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({
                  value: value as LeadStatus,
                  label,
                })),
              ]}
            />
          </div>
          {isLoading ? (
            <TableSkeleton columns={6} />
          ) : filteredLeads.length === 0 ? (
            <p className="text-muted-foreground">{strings.common.noResults}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שם</TableHead>
                  <TableHead>טלפון</TableHead>
                  <TableHead>מקור</TableHead>
                  <TableHead>{strings.common.status}</TableHead>
                  <TableHead>מעקב הבא</TableHead>
                  <TableHead>{strings.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead) => {
                  const telHref = toTelHref(lead.phone);
                  const waPhone = toWhatsAppPhone(lead.phone);
                  const followUpDue =
                    !!lead.next_follow_up_date &&
                    lead.next_follow_up_date <= todayStr &&
                    lead.status !== "converted" &&
                    lead.status !== "lost";
                  return (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">{lead.name}</TableCell>
                      <TableCell>{lead.phone ?? "—"}</TableCell>
                      <TableCell>{lead.source ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={lead.status} label={LEAD_STATUS_LABELS[lead.status] ?? lead.status} />
                      </TableCell>
                      <TableCell>
                        {lead.next_follow_up_date ? (
                          followUpDue ? (
                            <StatusBadge status="overdue" label={`לעקוב — ${formatDate(lead.next_follow_up_date)}`} />
                          ) : (
                            formatDate(lead.next_follow_up_date)
                          )
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {telHref && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-9 px-0"
                              aria-label="חיוג"
                              title="חיוג"
                              onClick={() => {
                                window.location.href = telHref;
                              }}
                            >
                              <IconPhone className="h-4 w-4" />
                            </Button>
                          )}
                          {waPhone && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-9 px-0"
                              aria-label="וואטסאפ"
                              title="וואטסאפ"
                              onClick={() => window.open(`https://wa.me/${waPhone}`, "_blank", "noopener,noreferrer")}
                            >
                              <IconWhatsApp className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => setEditing(lead)}>
                            {strings.common.edit}
                          </Button>
                          {lead.status !== "converted" && (
                            <Button variant="secondary" size="sm" onClick={() => void handleConvert(lead)}>
                              המרה ללקוח
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={async () => {
                              const ok = await confirmDialog({
                                title: "מחיקת ליד",
                                description: `למחוק את הליד "${lead.name}"? הפעולה אינה הפיכה.`,
                                confirmLabel: "מחק",
                                variant: "destructive",
                              });
                              if (ok) remove.mutate(lead.id);
                            }}
                          >
                            {strings.common.delete}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
    control,
    formState: { errors },
  } = useForm<LeadFormInput>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      name: initial?.name ?? "",
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
      source: initial?.source ?? "",
      next_follow_up_date: initial?.next_follow_up_date ?? "",
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
            <FormField label="תאריך מעקב הבא" htmlFor="next_follow_up_date" error={errors.next_follow_up_date?.message}>
              <Input id="next_follow_up_date" type="date" {...register("next_follow_up_date")} />
            </FormField>
            {initial && (
              <FormField label={strings.common.status} htmlFor="status" error={errors.status?.message}>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <StatusSelect
                      id="status"
                      value={field.value as LeadStatus}
                      onChange={field.onChange}
                      options={Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({
                        value: value as LeadStatus,
                        label,
                      }))}
                    />
                  )}
                />
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

const marketingPostFormSchema = marketingPostSchema.extend({
  status: z.enum(["idea", "draft", "scheduled", "published"]).optional(),
});
type MarketingPostFormInput = z.infer<typeof marketingPostFormSchema>;

// A simple planning board for social-media content — not a real
// Facebook/Instagram connection. Posting straight from here would need the
// business owner to set up a Meta developer/business account and connect
// the Page/Instagram account, which is a separate step for later; until
// then this is just where post ideas/drafts/schedule live so nothing gets
// forgotten, and the actual publishing happens by hand (copy the content
// over) or, later, through that real integration once it exists.
function MarketingTabContent() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = React.useState<MarketingPost | "new" | null>(null);

  const { data: posts, isLoading } = useQuery({
    queryKey: ["marketing_posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_posts")
        .select("*")
        .order("scheduled_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: MarketingPostFormInput & { id?: string }) => {
      const { id, status, ...rest } = values;
      const payload = {
        title: rest.title,
        platform: rest.platform,
        content: rest.content || null,
        scheduled_date: rest.scheduled_date || null,
        notes: rest.notes || null,
        ...(status ? { status, ...(status === "published" ? { published_date: new Date().toISOString().slice(0, 10) } : {}) } : {}),
      };
      if (id) {
        const { error } = await supabase.from("marketing_posts").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("marketing_posts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["marketing_posts"] });
      setEditing(null);
      toast({ title: "הפוסט נשמר בהצלחה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת הפוסט נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["marketing_posts"] });
      toast({ title: "הפוסט נמחק", variant: "success" });
    },
    onError: (err) => toast({ title: "מחיקת הפוסט נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const postList = posts ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-accent/20 p-3 text-xs text-muted-foreground">
        כאן מתכננים ומנהלים רעיונות וטיוטות לפוסטים לפייסבוק/אינסטגרם — אין
        כרגע פרסום אוטומטי ישירות לרשתות (זה דורש חיבור לחשבון מפתח של מטא);
        זה שלב שאפשר להוסיף בהמשך.
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setEditing((c) => (c === "new" ? null : "new"))}>+ פוסט חדש</Button>
      </div>

      {editing && (
        <MarketingPostForm
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
            <TableSkeleton columns={5} />
          ) : postList.length === 0 ? (
            <p className="text-muted-foreground">{strings.common.noResults}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>כותרת</TableHead>
                  <TableHead>פלטפורמה</TableHead>
                  <TableHead>{strings.common.status}</TableHead>
                  <TableHead>תאריך מתוכנן</TableHead>
                  <TableHead>{strings.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {postList.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell className="font-medium">{post.title}</TableCell>
                    <TableCell>{MARKETING_POST_PLATFORM_LABELS[post.platform] ?? post.platform}</TableCell>
                    <TableCell>
                      <StatusBadge status={post.status} label={MARKETING_POST_STATUS_LABELS[post.status] ?? post.status} />
                    </TableCell>
                    <TableCell>{formatDate(post.scheduled_date)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(post)}>
                          {strings.common.edit}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: "מחיקת פוסט",
                              description: `למחוק את "${post.title}"? הפעולה אינה הפיכה.`,
                              confirmLabel: "מחק",
                              variant: "destructive",
                            });
                            if (ok) remove.mutate(post.id);
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

interface MarketingPostFormProps {
  initial: MarketingPost | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: MarketingPostFormInput) => void;
}

function MarketingPostForm({ initial, submitting, error, onCancel, onSubmit }: MarketingPostFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<MarketingPostFormInput>({
    resolver: zodResolver(marketingPostFormSchema),
    defaultValues: {
      title: initial?.title ?? "",
      platform: initial?.platform ?? "facebook",
      content: initial?.content ?? "",
      scheduled_date: initial?.scheduled_date ?? "",
      notes: initial?.notes ?? "",
      status: initial?.status ?? "idea",
    },
  });

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="כותרת" htmlFor="title" error={errors.title?.message}>
              <Input id="title" {...register("title")} />
            </FormField>
            <FormField label="פלטפורמה" htmlFor="platform" error={errors.platform?.message}>
              <Controller
                name="platform"
                control={control}
                render={({ field }) => (
                  <StatusSelect
                    id="platform"
                    showDot={false}
                    value={field.value as MarketingPostPlatform}
                    onChange={field.onChange}
                    options={Object.entries(MARKETING_POST_PLATFORM_LABELS).map(([value, label]) => ({
                      value: value as MarketingPostPlatform,
                      label,
                    }))}
                  />
                )}
              />
            </FormField>
            <FormField label="תאריך מתוכנן" htmlFor="scheduled_date" error={errors.scheduled_date?.message}>
              <Input id="scheduled_date" type="date" {...register("scheduled_date")} />
            </FormField>
            {initial && (
              <FormField label={strings.common.status} htmlFor="status" error={errors.status?.message}>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <StatusSelect
                      id="status"
                      value={field.value as MarketingPostStatus}
                      onChange={field.onChange}
                      options={Object.entries(MARKETING_POST_STATUS_LABELS).map(([value, label]) => ({
                        value: value as MarketingPostStatus,
                        label,
                      }))}
                    />
                  )}
                />
              </FormField>
            )}
          </div>
          <FormField label="תוכן הפוסט" htmlFor="content" error={errors.content?.message}>
            <Textarea id="content" rows={5} placeholder="טקסט הפוסט..." {...register("content")} />
          </FormField>
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
