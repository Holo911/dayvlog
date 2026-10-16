"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GroupForm, type GroupValues } from "@/components/GroupForm";
import { Loading, Screen, TopBar } from "@/components/ui";
import { api, deviceTimeZone, loginUrl, type Me } from "@/lib/client";

export default function NewGroupPage() {
  const router = useRouter();
  const [initial, setInitial] = useState<GroupValues | null>(null);

  useEffect(() => {
    api<Me>("/api/me").then((me) => {
      if (!me.user) return window.location.replace(loginUrl());
      setInitial({ name: "", timezone: deviceTimeZone(), firstHour: 6, lastHour: 22 });
    });
  }, []);

  return (
    <Screen className="gap-4 pb-8">
      <TopBar title="New group" back="/?home" />
      {initial ? (
        <GroupForm
          initial={initial}
          submitLabel="Create group"
          onSubmit={async (values) => {
            const { id } = await api<{ id: string }>("/api/groups", { body: values });
            router.replace(`/g/${id}/settings?created`);
          }}
        />
      ) : (
        <Loading />
      )}
    </Screen>
  );
}
