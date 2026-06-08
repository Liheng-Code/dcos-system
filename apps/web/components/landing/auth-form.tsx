"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordInput } from "@/components/landing/password-input";
import { DemoUserDropdown } from "@/components/landing/demo-user-dropdown";
import { useSupabaseAuth } from "@/hooks/use-supabase-auth";

const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  remember: z.boolean().optional(),
});

const signUpSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  remember: z.boolean().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords must match",
  path: ["confirmPassword"],
});

type SignInData = z.infer<typeof signInSchema>;
type SignUpData = z.infer<typeof signUpSchema>;

interface AuthFormProps {
  mode: "signin" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const { signIn, signUp, loading } = useSupabaseAuth();

  const isSignIn = mode === "signin";
  const schema = isSignIn ? signInSchema : signUpSchema;

  type FormData = SignInData | SignUpData;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { remember: true },
  });

  const fe = (name: string) =>
    (errors as Record<string, { message?: string }>)[name];

  async function onSubmit(data: SignInData | SignUpData) {
    try {
      if (isSignIn) {
        const d = data as SignInData;
        await signIn(d.email, d.password);
      } else {
        const d = data as SignUpData;
        await signUp(d.fullName, d.email, d.password);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message === "Invalid login credentials"
            ? "Invalid email or password"
            : err.message
          : "Something went wrong. Please try again.";
      toast.error(message);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {!isSignIn && (
        <div className="space-y-2">
          <Label htmlFor="fullName">Full Name</Label>
          <Input
            id="fullName"
            placeholder="John Doe"
            {...register("fullName")}
            aria-invalid={!!fe("fullName")}
          />
          {fe("fullName") && (
            <p className="text-xs text-destructive">
              {(fe("fullName") as { message?: string }).message}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="john@example.com"
          {...register("email")}
          aria-invalid={!!fe("email")}
        />
        {fe("email") && (
          <p className="text-xs text-destructive">
            {(fe("email") as { message?: string }).message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
          {...register("password")}
          aria-invalid={!!fe("password")}
        />
        {fe("password") && (
          <p className="text-xs text-destructive">
            {(fe("password") as { message?: string }).message}
          </p>
        )}
      </div>

      {!isSignIn && (
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <PasswordInput
            id="confirmPassword"
            placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
            {...register("confirmPassword")}
            aria-invalid={!!fe("confirmPassword")}
          />
          {fe("confirmPassword") && (
            <p className="text-xs text-destructive">
              {(fe("confirmPassword") as { message?: string }).message}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Checkbox id="remember" {...register("remember")} />
        <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
          Remember me
        </Label>
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isSignIn ? "Sign In" : "Create Account"}
      </Button>

      {isSignIn && (
        <DemoUserDropdown signIn={signIn} loading={loading} />
      )}

      {isSignIn && (
        <p className="text-center text-sm text-muted-foreground">
          <button
            type="button"
            className="hover:text-foreground transition-colors"
          >
            Forgot password?
          </button>
        </p>
      )}
    </form>
  );
}
