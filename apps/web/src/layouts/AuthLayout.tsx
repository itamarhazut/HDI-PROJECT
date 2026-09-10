import { Outlet } from "react-router-dom";
import { Logo } from "../components/Logo";

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo
            className="flex flex-col items-center gap-3"
            markClassName="h-14 w-14"
            wordmarkClassName="text-xl font-bold tracking-tight text-sidebar-foreground"
          />
        </div>
        <div className="rounded-xl border border-sidebar-border bg-card p-6 shadow-xl shadow-black/20">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
