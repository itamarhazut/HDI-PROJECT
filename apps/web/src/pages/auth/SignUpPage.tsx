import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { signUpSchema, type SignUpInput, strings, linkOrCreateCustomerForCurrentUser } from "@repo/shared";
import { Button, Input, Label } from "@repo/ui";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

export function SignUpPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [checkEmail, setCheckEmail] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = async (values: SignUpInput) => {
    setServerError(null);
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          full_name: values.full_name,
          phone: values.phone ?? null,
          role: "customer",
        },
      },
    });
    if (error) {
      setServerError(error.message);
      return;
    }

    if (!data.session) {
      // Email confirmation is required by the Supabase project's auth settings.
      setCheckEmail(true);
      return;
    }

    // Link this new signup to an existing admin-entered customer record (by
    // phone/email) or create a new pending-review one.
    await linkOrCreateCustomerForCurrentUser(supabase, {
      phone: values.phone ?? null,
      fullName: values.full_name,
    });

    navigate("/");
  };

  if (checkEmail) {
    return (
      <p className="text-center text-sm">
        נשלח אימייל אימות. יש לאשר את הכתובת כדי להתחבר.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {!isSupabaseConfigured && (
        <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-800">
          Supabase עדיין לא מחובר — ראה SETUP.md בשורש הריפו.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="full_name">{strings.auth.fullName}</Label>
        <Input id="full_name" autoComplete="name" {...register("full_name")} />
        {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">{strings.auth.phone}</Label>
        <Input id="phone" type="tel" autoComplete="tel" {...register("phone")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{strings.auth.email}</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{strings.auth.password}</Label>
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {strings.auth.signUpCta}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {strings.auth.haveAccount}{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          {strings.auth.signIn}
        </Link>
      </p>
    </form>
  );
}
