"use client";

import { useState } from "react";
import { InstallHint } from "@/components/InstallHint";
import { PushToggle } from "@/components/PushToggle";
import { Button, Card, Loading, Screen, TopBar, cx } from "@/components/ui";
import { setCameraMode, useCameraMode, type CameraMode } from "@/lib/camera";
import { api, LAST_GROUP, useApi, type Me } from "@/lib/client";

const CAMERA_OPTIONS: { mode: CameraMode; title: string; text: string }[] = [
  {
    mode: "apple",
    title: "iPhone camera",
    text: "Opens Apple's camera, so the app never asks for camera permission. You film a few seconds and pick the best 2.5 s.",
  },
  {
    mode: "inapp",
    title: "In-app camera",
    text: "Records 2.5 s right inside the app. On iPhone it asks for camera permission again most times.",
  },
];

function CameraChoice() {
  const mode = useCameraMode();
  return (
    <Card className="flex flex-col gap-3">
      <p className="font-semibold">Camera on this device</p>
      {CAMERA_OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          onClick={() => setCameraMode(o.mode)}
          className={cx(
            "flex gap-3 rounded-2xl border p-3 text-left",
            mode === o.mode ? "border-accent bg-accent/10" : "border-line",
          )}
        >
          <span className={cx("mt-1 grid size-4 shrink-0 place-items-center rounded-full border-2", mode === o.mode ? "border-accent" : "border-muted")}>
            {mode === o.mode ? <span className="size-2 rounded-full bg-accent" /> : null}
          </span>
          <span>
            <span className="block font-semibold">{o.title}</span>
            <span className="block text-sm text-muted">{o.text}</span>
          </span>
        </button>
      ))}
    </Card>
  );
}

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
      <CameraChoice />
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
