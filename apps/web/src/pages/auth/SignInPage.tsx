import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { signInSchema, type SignInInput, strings } from "@repo/shared";
import { Button, Input, Label } from "@repo/ui";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

export function SignInPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });

  const onSubmit = async (values: SignInInput) => {
    setServerError(null);
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setServerError(error.message);
      return;
    }
    navigate("/");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {!isSupabaseConfigured && (
        <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-800">
          Supabase עדיין לא מחובר — ראה SETUP.md בשורש הריפו.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{strings.auth.email}</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{strings.auth.password}</Label>
        <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {strings.auth.signInCta}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {strings.auth.noAccount}{" "}
        <Link to="/signup" className="font-medium text-primary hover:underline">
          {strings.auth.signUp}
        </Link>
      </p>
    </form>
  );
}
