import * as React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "@repo/ui";
import { strings } from "@repo/shared";
import { useAuth } from "../auth/AuthProvider";
import { Logo } from "../components/Logo";
import { IconLogout, IconMenu, IconSettings, IconX } from "../components/icons";
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

  // Below the `lg` breakpoint the sidebar is no longer part of the flex
  // layout (see the <aside> below: `fixed ... lg:static`) — it becomes a
  // slide-in drawer over the content, opened with the floating menu button
  // and closed via the backdrop, its own close button, or picking a nav
  // item. Above `lg` this state is irrelevant: the `lg:translate-x-0` /
  // `lg:static` classes always win, so the sidebar stays put like before.
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const closeMobileNav = React.useCallback(() => setMobileNavOpen(false), []);

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
      {/* Dims/blocks the content behind the drawer on phones, and doubles
          as the "tap outside to close" target. Only ever mounted while the
          drawer is open, and gone above `lg` (the drawer itself is static
          there, so there's nothing to dim). */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={closeMobileNav}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          // Below `lg`: pinned to the viewport (not the flex flow) so it
          // overlays the page instead of squeezing <main> into a sliver —
          // that squeeze was the actual mobile bug (the fixed 256px column
          // simply didn't fit next to real content on a phone-width
          // screen). `start-0` anchors it to the same edge it already sits
          // on in the RTL flex layout (the right edge); the translate-x
          // classes below then slide it off past that edge when closed.
          "fixed inset-y-0 start-0 z-40 flex w-72 max-w-[85vw] shrink-0 flex-col bg-sidebar text-sidebar-foreground border-e border-sidebar-border shadow-2xl transition-transform duration-200 ease-in-out",
          // At `lg` and up: back to a normal, always-visible flex column,
          // exactly like before this file supported mobile at all.
          "lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0 lg:shadow-none",
          mobileNavOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between gap-2.5 px-5 py-5">
          <Logo
            markClassName="h-9 w-9 shrink-0"
            wordmarkClassName="text-xl font-extrabold tracking-tight text-sidebar-foreground"
          />
          {/* Only reachable on phones — at `lg` the drawer can't be closed
              (it's not a drawer anymore), so the button would be dead
              weight there. */}
          <button
            type="button"
            onClick={closeMobileNav}
            aria-label="סגירת תפריט"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-muted-foreground transition-colors hover:bg-black/5 hover:text-sidebar-foreground lg:hidden"
          >
            <IconX className="h-5 w-5" />
          </button>
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
                onClick={closeMobileNav}
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
                onClick={closeMobileNav}
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

      {/* Floating menu button — the only way to open the drawer on a
          phone, since the sidebar itself is off-screen by default there.
          Hidden while the drawer is open (the backdrop/close button/nav
          picks already cover closing it) and gone entirely at `lg`. */}
      {!mobileNavOpen && (
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="פתיחת תפריט ניווט"
          className="fixed bottom-5 start-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg lg:hidden"
        >
          <IconMenu className="h-6 w-6" />
        </button>
      )}

      <main className="min-w-0 flex-1 overflow-auto p-4 pb-24 lg:p-8 lg:pb-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
