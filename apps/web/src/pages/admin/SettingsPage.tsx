import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { strings } from "@repo/shared";
import { Card, CardContent, Button, Textarea, cn, useToast } from "@repo/ui";
import { PageHeader } from "../../components/PageHeader";
import { StatusSelect } from "../../components/StatusSelect";
import { IconChevronDown, IconSettings } from "../../components/icons";
import { getErrorMessage } from "../../lib/errors";
import { supabase } from "../../lib/supabase";
import { THEME_PRESETS, DEFAULT_THEME_PRESET_ID, type ThemePresetId } from "../../lib/theme";
import { ADMIN_NAV_ORDER_SETTINGS_KEY, applyNavOrder } from "../../layouts/adminNavItems";
import {
  useVatRate,
  useVehicleVatDeductibleRate,
  VAT_RATE_SETTINGS_KEY,
  VEHICLE_VAT_RATE_SETTINGS_KEY,
} from "../../hooks/useVatRate";
import { useQuoteFooterText, QUOTE_FOOTER_TEXT_SETTINGS_KEY } from "../../hooks/useQuoteFooterText";

// General, system-wide settings — reachable from the small gear icon next
// to the user's name at the bottom of the sidebar (not a regular nav item,
// since it's opened rarely): brand color, the main sidebar's item order,
// and the resource-library category order. More settings can be added as
// their own Card here later.
export function SettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: themeColor } = useQuery({
    queryKey: ["app_settings", "theme_color"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("key", "theme_color").maybeSingle();
      if (error) throw error;
      return typeof data?.value === "string" ? (data.value as ThemePresetId) : DEFAULT_THEME_PRESET_ID;
    },
  });

  // No "שמירה" button for this section on purpose — clicking a swatch
  // applies (and saves) it immediately, the same way the rest of this app
  // avoids an extra confirmation step for something this low-risk and
  // instantly reversible (just click another swatch).
  const setThemeColor = useMutation({
    mutationFn: async (presetId: ThemePresetId) => {
      const { error } = await supabase.from("app_settings").upsert({ key: "theme_color", value: presetId });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["app_settings", "theme_color"] }),
    onError: (err) => toast({ title: "שינוי ערכת הצבעים נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  // The main sidebar's item order (לוח בקרה, לקוחות, עבודות...) — saved as
  // one array of `to` paths under this key, applied on top of the fixed
  // item list by applyNavOrder. AdminLayout reads the exact same setting
  // to actually render the sidebar in this order.
  const { data: navOrder } = useQuery({
    queryKey: ["app_settings", ADMIN_NAV_ORDER_SETTINGS_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("key", ADMIN_NAV_ORDER_SETTINGS_KEY)
        .maybeSingle();
      if (error) throw error;
      return Array.isArray(data?.value) ? (data.value as string[]) : null;
    },
  });

  const setNavOrder = useMutation({
    mutationFn: async (order: string[]) => {
      const { error } = await supabase.from("app_settings").upsert({ key: ADMIN_NAV_ORDER_SETTINGS_KEY, value: order });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["app_settings", ADMIN_NAV_ORDER_SETTINGS_KEY] }),
    onError: (err) => toast({ title: "שינוי סדר התפריט נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  const orderedNavItems = applyNavOrder(navOrder);

  function moveNavItem(index: number, direction: "up" | "down") {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= orderedNavItems.length) return;
    const next = [...orderedNavItems];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(swapIndex, 0, item);
    setNavOrder.mutate(next.map((navItem) => navItem.to));
  }

  const { data: categories } = useQuery({
    queryKey: ["resource_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Reordering swaps sort_order with the neighboring row rather than
  // renumbering the whole list — simpler, and every category still ends up
  // with a distinct, correctly-ordered value after enough clicks even if
  // some old rows happened to share a sort_order to begin with.
  const moveCategory = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) => {
      const list = categories ?? [];
      const idx = list.findIndex((c) => c.id === id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return;
      const a = list[idx];
      const b = list[swapIdx];
      if (!a || !b) return;
      const { error: err1 } = await supabase.from("resource_categories").update({ sort_order: b.sort_order }).eq("id", a.id);
      if (err1) throw err1;
      const { error: err2 } = await supabase.from("resource_categories").update({ sort_order: a.sort_order }).eq("id", b.id);
      if (err2) throw err2;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["resource_categories"] }),
    onError: (err) => toast({ title: "שינוי הסדר נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  // VAT rate. Read through the same shared hook every money calculation in
  // the app uses (useVatRate.ts), so this screen and the quote form can't
  // end up disagreeing the way the old hard-coded constant did.
  const { vatRate } = useVatRate();
  const [vatInput, setVatInput] = React.useState("");
  React.useEffect(() => {
    setVatInput(String(Math.round(vatRate * 10000) / 100));
  }, [vatRate]);

  const setVatRate = useMutation({
    mutationFn: async (percent: number) => {
      if (!Number.isFinite(percent) || percent < 0 || percent >= 100) {
        throw new Error("שיעור המע״מ חייב להיות מספר בין 0 ל-99");
      }
      // Stored as a fraction, which is what every calculation expects.
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: VAT_RATE_SETTINGS_KEY, value: percent / 100 });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["app_settings", VAT_RATE_SETTINGS_KEY] });
      toast({ title: "שיעור המע״מ עודכן", variant: "success" });
    },
    onError: (err) =>
      toast({ title: "עדכון שיעור המע״מ נכשל", description: getErrorMessage(err), variant: "error" }),
  });

  // Default share of input VAT that may be claimed on vehicle/fuel
  // expenses — see useVehicleVatDeductibleRate for why this is a setting
  // rather than a constant.
  const { vehicleVatRate } = useVehicleVatDeductibleRate();
  const setVehicleVatRate = useMutation({
    mutationFn: async (rate: number) => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: VEHICLE_VAT_RATE_SETTINGS_KEY, value: rate });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["app_settings", VEHICLE_VAT_RATE_SETTINGS_KEY] });
      toast({ title: "ההגדרה נשמרה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת ההגדרה נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  // Google Calendar sync — a one-way (phone/Google Calendar → this app)
  // overlay on the dashboard's JobsCalendar widget. No OAuth or developer
  // account needed: Google (and Apple/iCloud, Outlook) can generate a
  // private "secret address in iCal format" URL from calendar settings,
  // and a Supabase Edge Function (sync-google-calendar) fetches that feed
  // server-side and hands the events back as JSON — the browser can't
  // fetch it directly since Google's ICS endpoint sends no CORS headers.
  // Stored in the same app_settings key/value table as the other settings
  // on this page, readable by anyone signed in, writable by admins only.
  const { data: googleIcsUrl } = useQuery({
    queryKey: ["app_settings", "google_calendar_ics_url"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("key", "google_calendar_ics_url")
        .maybeSingle();
      if (error) throw error;
      return typeof data?.value === "string" ? data.value : "";
    },
  });

  const [icsUrlInput, setIcsUrlInput] = React.useState("");
  const [icsUrlDirty, setIcsUrlDirty] = React.useState(false);
  React.useEffect(() => {
    if (!icsUrlDirty && googleIcsUrl !== undefined) setIcsUrlInput(googleIcsUrl);
  }, [googleIcsUrl, icsUrlDirty]);

  const setGoogleIcsUrl = useMutation({
    mutationFn: async (url: string) => {
      const trimmed = url.trim();
      const { error } = await supabase.from("app_settings").upsert({ key: "google_calendar_ics_url", value: trimmed });
      if (error) throw error;
    },
    onSuccess: () => {
      setIcsUrlDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["app_settings", "google_calendar_ics_url"] });
      void queryClient.invalidateQueries({ queryKey: ["google-calendar-events"] });
      toast({ title: "כתובת היומן נשמרה", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת כתובת היומן נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  // Fixed text shown at the bottom of every quote document, just above the
  // signature section (e.g. standard terms/conditions) — see
  // useQuoteFooterText.ts and QuoteDocumentView. Same dirty-tracking/save
  // pattern as the Google Calendar URL above: local input state so typing
  // doesn't fight with the query's own value, only marked dirty once the
  // person actually edits it.
  const { footerText: quoteFooterText } = useQuoteFooterText();
  const [footerTextInput, setFooterTextInput] = React.useState("");
  const [footerTextDirty, setFooterTextDirty] = React.useState(false);
  React.useEffect(() => {
    if (!footerTextDirty) setFooterTextInput(quoteFooterText);
  }, [quoteFooterText, footerTextDirty]);

  const setQuoteFooterText = useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: QUOTE_FOOTER_TEXT_SETTINGS_KEY, value: text.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setFooterTextDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["app_settings", QUOTE_FOOTER_TEXT_SETTINGS_KEY] });
      toast({ title: "הטקסט נשמר", variant: "success" });
    },
    onError: (err) => toast({ title: "שמירת הטקסט נכשלה", description: getErrorMessage(err), variant: "error" }),
  });

  const categoryList = categories ?? [];
  const activeThemeId = themeColor ?? DEFAULT_THEME_PRESET_ID;

  // The VAT rate used by every quote. It lived only in the database (and,
  // wrongly, in a second hard-coded constant) with no way to change it
  // without a developer — so when VAT moved from 17% to 18% the app kept
  // quietly computing the old rate. Stored as a fraction (0.18) and edited
  // here as a percentage, which is how everyone actually talks about it.
  const vatPercentValue = Math.round(vatRate * 10000) / 100;
  const vatDirty = vatInput.trim() !== "" && Number(vatInput) !== vatPercentValue;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={strings.nav.settings}
        description="הגדרות כלליות של המערכת."
        icon={IconSettings}
        color="bg-slate-500"
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">ערכת צבעים</p>
            <p className="text-xs text-muted-foreground">בחירה מתעדכנת בכל המערכת באופן מיידי.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {THEME_PRESETS.map((preset) => {
              const active = activeThemeId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setThemeColor.mutate(preset.id)}
                  disabled={setThemeColor.isPending}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center transition-colors disabled:opacity-60",
                    active ? "border-primary bg-primary/5" : "border-border hover:bg-accent/30"
                  )}
                >
                  <span
                    className="h-8 w-8 rounded-full border border-black/10"
                    style={{ backgroundColor: preset.swatch }}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-medium">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">שיעור מע״מ</p>
            <p className="text-xs text-muted-foreground">
              משמש בחישוב הצעות מחיר — במסך, בתצוגה המקדימה וב-PDF שהלקוח מקבל. נכון להיום המע״מ בישראל הוא 18%.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <input
                id="vat_rate"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                max="99"
                dir="ltr"
                value={vatInput}
                onChange={(e) => setVatInput(e.target.value)}
                className="h-10 w-28 rounded-md border border-input bg-background px-3 text-sm"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={setVatRate.isPending || !vatDirty}
              onClick={() => setVatRate.mutate(Number(vatInput))}
            >
              שמירה
            </Button>
            <p className="text-xs text-muted-foreground">
              שינוי כאן משפיע על הצעות מחיר חדשות בלבד — הצעות קיימות שומרות את השיעור שלפיו הופקו.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">טקסט קבוע בתחתית הצעת מחיר</p>
            <p className="text-xs text-muted-foreground">
              מוצג בתחתית כל הצעת מחיר, ממש לפני שורות החתימה — לדוגמה תנאים/הבהרות כלליים. משאירים ריק אם לא צריך.
            </p>
          </div>
          <Textarea
            value={footerTextInput}
            onChange={(e) => {
              setFooterTextInput(e.target.value);
              setFooterTextDirty(true);
            }}
            rows={4}
          />
          <div>
            <Button
              type="button"
              size="sm"
              disabled={setQuoteFooterText.isPending || footerTextInput === quoteFooterText}
              onClick={() => setQuoteFooterText.mutate(footerTextInput)}
            >
              שמירה
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">מע״מ תשומות על רכב ודלק</p>
            <p className="text-xs text-muted-foreground">
              ברירת המחדל לאחוז המע״מ שניתן לקזז בהוצאות מסוג &quot;דלק ורכב&quot;. ברכב פרטי לרוב אי אפשר לקזז מע״מ
              כלל, וברכב מסחרי כן — כדאי לוודא את זה מול רואה החשבון פעם אחת, ואז זה נקבע מעצמו בכל הוצאה.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <StatusSelect
              id="vehicle_vat"
              className="w-56"
              showDot={false}
              value={String(vehicleVatRate)}
              onChange={(next) => setVehicleVatRate.mutate(Number(next))}
              disabled={setVehicleVatRate.isPending}
              options={[
                { value: "1", label: "100% — רכב מסחרי" },
                { value: "0.5", label: "50%" },
                { value: "0", label: "0% — רכב פרטי" },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">סנכרון עם יומן Google (טלפון ← אפליקציה)</p>
            <p className="text-xs text-muted-foreground">
              כיוון אחד בלבד: אירועים שנרשמים ביומן הטלפון (Google Calendar) יופיעו כאן, בלוח השנה שבלוח הבקרה. שינויים
              באפליקציה הזו לא נכתבים חזרה ליומן.
            </p>
          </div>
          <div className="rounded-md bg-accent/30 p-3 text-xs text-muted-foreground">
            איך מוצאים את הכתובת ב-Google Calendar: הגדרות ← בוחרים את היומן הרצוי בצד שמאל ← &quot;שילוב יומן&quot; (Integrate
            calendar) ← מעתיקים את &quot;הכתובת הסודית בפורמט iCal&quot; (Secret address in iCal format). מדובר בכתובת פרטית —
            כדאי לא לשתף אותה עם אחרים.
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="url"
              inputMode="url"
              dir="ltr"
              placeholder="https://calendar.google.com/calendar/ical/.../private-.../basic.ics"
              value={icsUrlInput}
              onChange={(e) => {
                setIcsUrlInput(e.target.value);
                setIcsUrlDirty(true);
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <Button
              type="button"
              size="sm"
              disabled={setGoogleIcsUrl.isPending || icsUrlInput.trim() === (googleIcsUrl ?? "")}
              onClick={() => setGoogleIcsUrl.mutate(icsUrlInput)}
            >
              שמירה
            </Button>
            {googleIcsUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={setGoogleIcsUrl.isPending}
                onClick={() => {
                  setIcsUrlInput("");
                  setGoogleIcsUrl.mutate("");
                }}
              >
                ניתוק
              </Button>
            ) : null}
          </div>
          {googleIcsUrl ? (
            <p className="text-xs text-emerald-600">✓ מחובר — אירועים מהיומן יופיעו בלוח השנה של לוח הבקרה.</p>
          ) : (
            <p className="text-xs text-muted-foreground">לא מוגדרת כתובת יומן עדיין.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">סדר פריטי התפריט הראשי</p>
            <p className="text-xs text-muted-foreground">
              קובע את הסדר שבו לוח הבקרה, לקוחות, עבודות וכל שאר הפריטים מופיעים בסרגל הצד.
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {orderedNavItems.map((navItem, i) => {
              const Icon = navItem.icon;
              return (
                <li key={navItem.to} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {navItem.label}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="הזזה מעלה"
                      disabled={i === 0 || setNavOrder.isPending}
                      onClick={() => moveNavItem(i, "up")}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
                    >
                      <IconChevronDown className="h-4 w-4 rotate-180" />
                    </button>
                    <button
                      type="button"
                      aria-label="הזזה מטה"
                      disabled={i === orderedNavItems.length - 1 || setNavOrder.isPending}
                      onClick={() => moveNavItem(i, "down")}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
                    >
                      <IconChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">סדר הקטגוריות בספריית המשאבים (חברת חשמל)</p>
            <p className="text-xs text-muted-foreground">
              קובע את הסדר שבו הקטגוריות מוצגות בתוך &quot;חברת חשמל&quot; — הזזה בחיצים.
            </p>
          </div>
          {categoryList.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין קטגוריות עדיין.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {categoryList.map((category, i) => (
                <li key={category.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm">{category.name}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="הזזה מעלה"
                      disabled={i === 0 || moveCategory.isPending}
                      onClick={() => moveCategory.mutate({ id: category.id, direction: "up" })}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
                    >
                      <IconChevronDown className="h-4 w-4 rotate-180" />
                    </button>
                    <button
                      type="button"
                      aria-label="הזזה מטה"
                      disabled={i === categoryList.length - 1 || moveCategory.isPending}
                      onClick={() => moveCategory.mutate({ id: category.id, direction: "down" })}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
                    >
                      <IconChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
