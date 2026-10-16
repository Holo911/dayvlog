"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, safeNext, useBrowser } from "@/lib/client";
import { Button, ErrorText, Field, Input, Logo, Screen } from "./ui";

// Plain email + password on purpose: inside an installed iPhone web app, iCloud Keychain
// offers a strong password on sign-up and fills it with Face ID afterwards, which is as
// quick as "Sign in with Google" without the OAuth redirect that breaks Home Screen apps.
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signup = mode === "signup";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/api/auth/${mode}`, {
        body: {
          email: form.get("email"),
          password: form.get("password"),
          ...(signup ? { name: form.get("name") } : {}),
        },
      });
      window.location.replace(safeNext());
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  // Keep ?next= when switching between sign-in and sign-up, without a hydration mismatch.
  const search = useBrowser(() => window.location.search, "");
  const switchHref = `${signup ? "/login" : "/signup"}${search}`;

  return (
    <Screen className="justify-center gap-8 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={64} />
        <h1 className="text-2xl font-bold">{signup ? "Create your account" : "Welcome back"}</h1>
      </div>
      <form method="post" onSubmit={submit} className="flex flex-col gap-4">
        {signup ? (
          <Field label="Your name" hint="Your friends see this under your clips.">
            <Input name="name" autoComplete="nickname" required maxLength={30} placeholder="First name or nickname" />
          </Field>
        ) : null}
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" required />
        </Field>
        <Field label="Password" hint={signup ? "At least 8 characters. Your iPhone can suggest and save one." : undefined}>
          <Input
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={signup ? 8 : undefined}
            required
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy}>
          {signup ? "Create account" : "Sign in"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        {signup ? "Already have an account? " : "New here? "}
        <Link href={switchHref} className="font-semibold text-ink underline underline-offset-4">
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
      {!signup ? (
        <p className="text-center text-xs text-muted">Forgot your password? Ask your group&apos;s owner for a reset link.</p>
      ) : null}
    </Screen>
  );
}
