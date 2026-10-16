"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InstallHint } from "@/components/InstallHint";
import { Button, ErrorText, LinkButton, Loading, Logo, Screen } from "@/components/ui";
import { api, isIos, isStandalone, useBrowser, type Me } from "@/lib/client";

// Invite links open in Safari, but the installed app has its own separate login, so on an
// iPhone we show the code big and walk people through installing first.
export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const needsInstall = useBrowser(() => isIos() && !isStandalone(), false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upper = code.toUpperCase();

  useEffect(() => {
    api<Me>("/api/me").then(setMe);
  }, []);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/groups/join", { body: { code: upper } });
      router.replace(`/g/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!me) return <Loading />;
  const next = encodeURIComponent(`/join/${upper}`);

  return (
    <Screen className="justify-center gap-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={64} />
        <h1 className="text-2xl font-bold">You&apos;re invited to Day Vlog</h1>
        <p className="text-muted">Your invite code</p>
        <p className="rounded-2xl border border-line bg-surface px-6 py-3 font-mono text-3xl tracking-[0.3em]">{upper}</p>
      </div>
      {me.user ? (
        <>
          <Button onClick={join} busy={busy}>
            Join the group
          </Button>
          <ErrorText>{error}</ErrorText>
        </>
      ) : needsInstall ? (
        <>
          <InstallHint />
          <p className="text-center text-sm text-muted">
            Then create your account in the app and enter <b className="font-mono text-ink">{upper}</b> under
            &ldquo;Join with a code&rdquo;.
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <LinkButton href={`/signup?next=${next}`}>Create account and join</LinkButton>
          <LinkButton href={`/login?next=${next}`} variant="secondary">
            I already have an account
          </LinkButton>
        </div>
      )}
    </Screen>
  );
}
