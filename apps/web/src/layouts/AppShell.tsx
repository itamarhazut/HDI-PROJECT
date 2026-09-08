import * as React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@repo/ui";
import { strings } from "@repo/shared";
import { useAuth } from "../auth/AuthProvider";

export interface NavItem {
  to: string;
  label: string;
}

interface AppShellProps {
  title: string;
  navItems: NavItem[];
}

export function AppShell({ title, navItems }: AppShellProps) {
  const { profile, signOut } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-e bg-secondary/40 p-4">
        <div className="mb-6 px-2">
          <p className="text-lg font-bold">{title}</p>
          {profile?.full_name && <p className="text-sm text-muted-foreground">{profile.full_name}</p>}
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-2 text-sm font-medium hover:bg-accent",
                  isActive && "bg-primary text-primary-foreground hover:bg-primary"
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => void signOut()}
          className="mt-4 rounded-md px-3 py-2 text-start text-sm font-medium text-muted-foreground hover:bg-accent"
        >
          {strings.nav.logout}
        </button>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
