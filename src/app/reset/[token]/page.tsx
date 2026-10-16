"use client";

import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { InstallHint } from "@/components/InstallHint";
import { Button, ErrorText, Field, Logo, PasswordInput, Screen } from "@/components/ui";
import { api } from "@/lib/client";

export default function ResetPage() {
  const { token } = useParams<{ token: string }>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/reset", { body: { token, password: new FormData(e.currentTarget).get("password") } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen className="justify-center gap-6 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={56} />
        <h1 className="text-2xl font-bold">{done ? "Password changed" : "Choose a new password"}</h1>
      </div>
      {done ? (
        <>
          <p className="text-center text-muted">Open Day Vlog from your Home Screen and sign in with the new password.</p>
          <InstallHint />
        </>
      ) : (
        <form method="post" onSubmit={submit} className="flex flex-col gap-4">
          <Field label="New password" hint="At least 8 characters.">
            <PasswordInput name="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy}>
            Save password
          </Button>
        </form>
      )}
    </Screen>
  );
}
