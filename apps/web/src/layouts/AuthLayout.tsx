import { Outlet } from "react-router-dom";

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-xl font-bold">מערכת ניהול העסק</h1>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
