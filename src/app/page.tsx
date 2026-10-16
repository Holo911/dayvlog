"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { InstallHint } from "@/components/InstallHint";
import { Button, Card, ErrorText, Input, LinkButton, Loading, Logo, Screen, TopBar } from "@/components/ui";
import { api, LAST_GROUP, type Me } from "@/lib/client";
import { cityName, formatHour } from "@/lib/time";

export default function Home() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>("/api/me").then((data) => {
      // Opening the installed app lands straight in the group you used last.
      const last = localStorage.getItem(LAST_GROUP);
      const stay = new URLSearchParams(window.location.search).has("home");
      if (!stay && data.user && last && data.groups.some((g) => g.id === last)) {
        router.replace(`/g/${last}`);
        return;
      }
      setMe(data);
    });
  }, [router]);

  if (!me) return <Loading />;
  if (!me.user) return <Welcome />;

  return (
    <Screen className="gap-5 pb-8">
      <TopBar
        title="Your groups"
        right={
          <Link href="/settings" className="text-sm text-muted">
            {me.user.name}
          </Link>
        }
      />
      {me.groups.map((g) => (
        <Link key={g.id} href={`/g/${g.id}`} className="block">
          <Card className="flex items-center justify-between active:bg-raised">
            <div>
              <p className="text-lg font-semibold">{g.name}</p>
              <p className="text-sm text-muted">
                Drops {formatHour(g.firstHour)}–{formatHour(g.lastHour)} · {cityName(g.timezone)} time
              </p>
            </div>
            <span className="text-muted">›</span>
          </Card>
        </Link>
      ))}
      {me.groups.length === 0 ? (
        <p className="py-2 text-muted">You&apos;re not in a group yet. Join your friends with their invite code, or start a new group.</p>
      ) : null}
      <JoinByCode />
      <LinkButton href="/new" variant="secondary">
        Start a new group
      </LinkButton>
    </Screen>
  );
}

function JoinByCode() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/groups/join", { body: { code: new FormData(e.currentTarget).get("code") } });
      router.push(`/g/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="font-semibold">Join with a code</p>
        <div className="flex gap-2">
          <Input name="code" placeholder="K7P2QX" autoCapitalize="characters" autoComplete="off" required maxLength={12} className="font-mono tracking-widest uppercase" />
          <Button type="submit" busy={busy} className="w-auto px-5">
            Join
          </Button>
        </div>
        <ErrorText>{error}</ErrorText>
      </form>
    </Card>
  );
}

function Welcome() {
  return (
    <Screen className="justify-between gap-8 py-10">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <Logo size={96} />
        <h1 className="text-4xl font-bold tracking-tight">Day Vlog</h1>
        <p className="max-w-xs text-lg text-muted">
          Every hour, two seconds of your day. At night it all turns into one vlog with your friends.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <InstallHint />
        <LinkButton href="/signup">Create account</LinkButton>
        <LinkButton href="/login" variant="secondary">
          I already have an account
        </LinkButton>
      </div>
    </Screen>
  );
}
