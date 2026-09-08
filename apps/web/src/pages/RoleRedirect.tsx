import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

// Sends a logged-in user to the right home screen based on their role.
// The "/" route always renders this — actual dashboards live under
// /admin and /portal.
export function RoleRedirect() {
  const { profile, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">טוען...</div>;
  }

  if (profile?.role === "admin") return <Navigate to="/admin" replace />;
  return <Navigate to="/portal" replace />;
}
