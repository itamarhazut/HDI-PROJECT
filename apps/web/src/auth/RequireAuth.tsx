import * as React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import type { UserRole } from "@repo/shared";
import { FullScreenLoader } from "../components/FullScreenLoader";

interface RequireAuthProps {
  allowedRoles?: UserRole[];
}

// Route guard: gates on having a session at all, and optionally on the
// profile's role. This is a UX convenience only — the real access boundary
// is enforced server-side by Postgres Row Level Security (see
// supabase/migrations/0001_init.sql), so a bypass here can never leak data.
export function RequireAuth({ allowedRoles }: RequireAuthProps) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <FullScreenLoader />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
