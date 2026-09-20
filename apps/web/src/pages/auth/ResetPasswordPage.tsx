import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useSearchParams } from "react-router-dom";
import { resetPasswordSchema, type ResetPasswordInput, strings } from "@repo/shared";
import { Button, Input, Label } from "@repo/ui";
import { supabase } from "../../lib/supabase";
import { Spinner } from "../../components/Spinner";

type Stage = "exchanging" | "invalid" | "form" | "done";

// Landed on from the email link ForgotPasswordPage sends
// (supabase.auth.resetPasswordForEmail's redirectTo) — arrives as
// "/#/reset-password?code=...". react-router-dom's hash router parses that
// trailing "?code=..." into normal in-app search params (useSearchParams
// below), exactly like it would on any other route; see the PKCE note in
// packages/shared/src/supabase/client.ts for why the code lands there
// intact instead of colliding with the router's own "#" routing.
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");
  const [stage, setStage] = React.useState<Stage>(code ? "exchanging" : "invalid");
  const [serverError, setServerError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });

  React.useEffect(() => {
    if (!code) return;
    let active = true;
    // Trades the one-time code for a real session — this is what actually
    // authenticates the browser as this user long enough to call
    // supabase.auth.updateUser({ password }) below. A code is single-use and
    // expires (Supabase default: 1 hour), so an old/reused link lands here
    // too — that's reported as the same "invalid" state as no code at all,
    // not a crash.
    void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (!active) return;
      setStage(error ? "invalid" : "form");
    });
    return () => {
      active = false;
    };
  }, [code]);

  const onSubmit = async (values: ResetPasswordInput) => {
    setServerError(null);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setServerError(error.message);
      return;
    }
    // Sign out of the one-off recovery session deliberately — the person
    // came from an email link, not a device they necessarily meant to stay
    // logged into, so the safer default is to send them back through a
    // normal login with the new password rather than dropping them straight
    // into the app.
    await supabase.auth.signOut();
    setStage("done");
  };

  if (stage === "exchanging") {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <Spinner />
        <p className="text-sm text-muted-foreground">{strings.common.loading}</p>
      </div>
    );
  }

  if (stage === "invalid") {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-lg font-semibold">{strings.auth.invalidResetLink}</h1>
        <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          {strings.auth.forgotPassword}
        </Link>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-lg font-semibold">{strings.auth.resetPasswordSuccessTitle}</h1>
        <p className="text-sm text-muted-foreground">{strings.auth.resetPasswordSuccessBody}</p>
        <Link to="/login" className="text-sm font-medium text-primary hover:underline">
          {strings.auth.signIn}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">{strings.auth.newPassword}</h1>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{strings.auth.newPassword}</Label>
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">{strings.auth.confirmPassword}</Label>
        <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
        {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {strings.auth.resetPasswordCta}
      </Button>
    </form>
  );
}
