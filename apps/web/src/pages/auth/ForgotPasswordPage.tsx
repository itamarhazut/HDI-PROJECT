import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { forgotPasswordSchema, type ForgotPasswordInput, strings } from "@repo/shared";
import { Button, Input, Label } from "@repo/ui";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

export function ForgotPasswordPage() {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (values: ForgotPasswordInput) => {
    setServerError(null);
    // The link Supabase emails lands back on this same app at
    // "/#/reset-password?code=..." (see the PKCE note in
    // packages/shared/src/supabase/client.ts) — ResetPasswordPage reads that
    // code and exchanges it for a session there.
    //
    // Note: this exact redirect URL must be listed under Authentication →
    // URL Configuration → Redirect URLs in the Supabase dashboard, or
    // Supabase silently falls back to the project's default Site URL
    // instead of sending the user back here.
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/#/reset-password`,
    });
    // Deliberately shown even on error (other than a genuinely malformed
    // request) — Supabase itself never reveals whether an email address is
    // registered, and neither should this form; a "such-and-such account
    // doesn't exist" message would let anyone probe which emails have
    // accounts here.
    if (error && error.status && error.status >= 500) {
      setServerError(error.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-lg font-semibold">{strings.auth.resetLinkSentTitle}</h1>
        <p className="text-sm text-muted-foreground">{strings.auth.resetLinkSentBody}</p>
        <Link to="/login" className="text-sm font-medium text-primary hover:underline">
          {strings.auth.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {!isSupabaseConfigured && (
        <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-800">
          Supabase עדיין לא מחובר — ראה SETUP.md בשורש הריפו.
        </p>
      )}
      <div>
        <h1 className="text-lg font-semibold">{strings.auth.forgotPassword}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          נזין את כתובת האימייל של החשבון ונשלח קישור לאיפוס הסיסמה.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{strings.auth.email}</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {strings.auth.sendResetLink}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-primary hover:underline">
          {strings.auth.backToLogin}
        </Link>
      </p>
    </form>
  );
}
