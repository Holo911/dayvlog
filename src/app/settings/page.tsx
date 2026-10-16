"use client";

import { useState } from "react";
import { InstallHint } from "@/components/InstallHint";
import { PushToggle } from "@/components/PushToggle";
import { Button, Card, Loading, Screen, TopBar } from "@/components/ui";
import { api, LAST_GROUP, useApi, type Me } from "@/lib/client";

export default function SettingsPage() {
  const { data } = useApi<Me>("/api/me");
  const [busy, setBusy] = useState(false);

  if (!data) return <Loading />;
  if (!data.user) {
    window.location.replace("/login?next=/settings");
    return <Loading />;
  }

  return (
    <Screen className="gap-4 pb-8">
      <TopBar title="Settings" back="/?home" />
      <Card>
        <p className="text-lg font-semibold">{data.user.name}</p>
        <p className="text-sm text-muted">{data.user.email}</p>
      </Card>
      <Card className="flex flex-col gap-3">
        <p className="font-semibold">Notifications on this device</p>
        <PushToggle />
      </Card>
      <InstallHint />
      <Button
        variant="secondary"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          await api("/api/auth/logout", { body: {} });
          localStorage.removeItem(LAST_GROUP);
          window.location.replace("/");
        }}
      >
        Sign out
      </Button>
    </Screen>
  );
}
