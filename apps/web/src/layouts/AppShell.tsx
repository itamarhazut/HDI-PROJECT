import * as React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "@repo/ui";
import { strings } from "@repo/shared";
import { useAuth } from "../auth/AuthProvider";
import { Logo } from "../components/Logo";
import { IconLogout, IconSettings } from "../components/icons";
import { useAppliedTheme } from "../lib/theme";

export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  end?: boolean;
}

interface AppShellProps {
  title: string;
  navItems: NavItem[];
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  admin: "מנהל/ת מערכת",
  customer: "לקוח/ה",
  technician: "טכנאי/ת",
};

// One color per nav item, cycling — gives the sidebar some life instead of
// one flat icon color repeated nine times.
const NAV_BADGE_COLORS = [
  "bg-indigo-500",
  "bg-teal-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-fuchsia-500",
];

export function AppShell({ navItems }: AppShellProps) {
  const { profile, signOut } = useAuth();
  // Applies whichever brand-color preset was picked on the settings page
  // (app_settings → theme_color) as soon as this shell mounts — shared by
  // both the admin and customer-portal layouts, so the chosen color follows
  // the business everywhere, not just the admin side. No return value is
  // needed here; the hook's own effect does the actual repainting.
  useAppliedTheme();

  return (
    // Locked to the viewport (not just min-h-screen, which only sets a
    // *floor* — a page taller than the window used to grow the whole
    // document instead of scrolling internally, so the browser/OS scrolled
    // html/body as one unit and dragged the sidebar down along with the
    // page content). h-screen + overflow-hidden here makes this the one
    // fixed-size box for the whole app, so only <main> below — the actual
    // scrollable region — ever grows a scrollbar. This is also what makes
    // the app fit correctly in a short window (e.g. snapped to half the
    // screen): the shell now always matches the real viewport instead of
    // assuming there's enough height for everything to fit unscrolled.
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-e border-sidebar-border">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Logo
            markClassName="h-9 w-9 shrink-0"
            wordmarkClassName="text-xl font-extrabold tracking-tight text-sidebar-foreground"
          />
        </div>

        {/* Its own scroll region, independent from <main> — a long nav
            list (or a short window) scrolls just this middle section,
            while the logo above and the profile/sign-out block below stay
            pinned in place. */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          {navItems.map((item, i) => {
            const Icon = item.icon;
            const badgeColor = NAV_BADGE_COLORS[i % NAV_BADGE_COLORS.length];
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-sidebar-muted-foreground transition-colors",
                    "hover:bg-black/5 hover:text-sidebar-foreground",
                    isActive && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )
                }
              >
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", badgeColor)}>
                  <Icon className="h-[18px] w-[18px] text-white" />
                </span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
              {initials(profile?.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-foreground">{profile?.full_name ?? "—"}</p>
              <p className="truncate text-xs text-sidebar-muted-foreground">
                {profile?.role ? ROLE_LABELS[profile.role] ?? profile.role : ""}
              </p>
            </div>
            {/* Tucked here rather than a full nav item, per the business
                owner's own preference — a small, low-key entry point since
                it's opened rarely, not a page visited day to day. */}
            {profile?.role === "admin" && (
              <Link
                to="/admin/settings"
                aria-label={strings.nav.settings}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-muted-foreground transition-colors hover:bg-black/5 hover:text-sidebar-foreground"
              >
                <IconSettings className="h-[18px] w-[18px]" />
              </Link>
            )}
          </div>
          <button
            onClick={() => void signOut()}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-muted-foreground transition-colors hover:bg-black/5 hover:text-sidebar-foreground"
          >
            <IconLogout className="h-[18px] w-[18px] shrink-0" />
            <span>{strings.nav.logout}</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
