"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { GroupForm } from "@/components/GroupForm";
import { GroupFrame } from "@/components/GroupTabs";
import { Button, Card, ErrorText, Loading, Toggle, TopBar } from "@/components/ui";
import { api, initials, LAST_GROUP, memberColor, useApi, useBrowser, type GroupInfo } from "@/lib/client";

async function share(title: string, url: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text: title, url });
      return "shared";
    } catch {
      return null;
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}

export default function GroupSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: info, reload, setData } = useApi<GroupInfo>(`/api/groups/${id}`);
  const created = useBrowser(() => window.location.search.includes("created"), false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<{ name: string; url: string } | null>(null);

  if (!info) {
    return (
      <GroupFrame groupId={id}>
        <Loading />
      </GroupFrame>
    );
  }
  const { group, members, me } = info;
  const inviteUrl = `${window.location.origin}/join/${group.inviteCode}`;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <GroupFrame groupId={id}>
      <TopBar title="Group settings" back={`/g/${id}`} />

      {created ? (
        <Card className="border-accent/40">
          <p className="font-semibold">Group created 🎉</p>
          <p className="text-sm text-muted">Send the invite link to your friends. Up to 12 people can join.</p>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3">
        <p className="text-sm text-muted">Invite code</p>
        <p className="font-mono text-3xl tracking-[0.3em]">{group.inviteCode}</p>
        <Button
          onClick={() => run(async () => setNote(await share(`Join ${group.name} on Day Vlog`, inviteUrl)))}
        >
          {note === "copied" ? "Link copied ✓" : "Share invite link"}
        </Button>
        {me.isOwner ? (
          <button
            type="button"
            className="self-start text-sm text-muted underline underline-offset-4"
            onClick={() =>
              run(async () => {
                if (!confirm("Make a new code? The old link stops working.")) return;
                const { inviteCode } = await api<{ inviteCode: string }>(`/api/groups/${id}/invite`, { body: {} });
                setData({ ...info, group: { ...group, inviteCode } });
              })
            }
          >
            Make a new code
          </button>
        ) : null}
      </Card>

      <Card className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">Drop notifications</p>
          <p className="text-sm text-muted">For this group, on all your devices.</p>
        </div>
        <Toggle
          label="Drop notifications"
          checked={me.notify}
          onChange={(notify) =>
            run(async () => {
              setData({ ...info, me: { ...me, notify } });
              await api(`/api/groups/${id}/me`, { method: "PATCH", body: { notify } });
            })
          }
        />
      </Card>

      <Card>
        <p className="mb-3 font-semibold">Drop hours</p>
        <GroupForm
          initial={{ name: group.name, timezone: group.timezone, firstHour: group.firstHour, lastHour: group.lastHour }}
          readOnly={!me.isOwner}
          submitLabel="Save"
          onSubmit={async (values) => {
            await api(`/api/groups/${id}`, { method: "PATCH", body: values });
            await reload();
          }}
        />
      </Card>

      <Card className="flex flex-col gap-1">
        <p className="mb-2 font-semibold">
          Members · {members.length}/12
        </p>
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 py-1.5">
            <span className="grid size-9 place-items-center rounded-full text-xs font-bold text-black" style={{ background: memberColor(m.id) }}>
              {initials(m.name)}
            </span>
            <span className="flex-1">
              {m.name}
              {m.id === group.ownerId ? <span className="ml-2 text-xs text-muted">owner</span> : null}
              {m.id === me.id ? <span className="ml-2 text-xs text-muted">you</span> : null}
            </span>
            {me.isOwner && m.id !== me.id ? (
              <span className="flex gap-3 text-sm">
                <button
                  type="button"
                  className="text-muted underline underline-offset-4"
                  onClick={() =>
                    run(async () => {
                      const { path } = await api<{ path: string }>(`/api/groups/${id}/members/${m.id}/reset`, { body: {} });
                      setResetLink({ name: m.name, url: window.location.origin + path });
                    })
                  }
                >
                  Reset password
                </button>
                <button
                  type="button"
                  className="text-accent underline underline-offset-4"
                  onClick={() =>
                    run(async () => {
                      if (!confirm(`Remove ${m.name} and their clips from the group?`)) return;
                      await api(`/api/groups/${id}/members/${m.id}`, { method: "DELETE", body: {} });
                      await reload();
                    })
                  }
                >
                  Remove
                </button>
              </span>
            ) : null}
          </div>
        ))}
        {resetLink ? (
          <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-raised p-3 text-sm">
            <p>
              Send this one-time link to <b>{resetLink.name}</b>. It works for 48 hours.
            </p>
            <p className="break-all font-mono text-xs text-muted">{resetLink.url}</p>
            <Button variant="secondary" onClick={() => run(() => share("Reset your Day Vlog password", resetLink.url))}>
              Share link
            </Button>
          </div>
        ) : null}
      </Card>

      <ErrorText>{error}</ErrorText>

      <Button
        variant="danger"
        onClick={() =>
          run(async () => {
            const last = members.length === 1;
            const msg = last
              ? "You're the last member. Leaving deletes the group and all its clips. Continue?"
              : "Leave this group? Your clips in it are deleted.";
            if (!confirm(msg)) return;
            await api(`/api/groups/${id}/leave`, { body: {} });
            localStorage.removeItem(LAST_GROUP);
            router.replace("/?home");
          })
        }
      >
        Leave group
      </Button>
      <Link href="/settings" className="py-2 text-center text-sm text-muted underline underline-offset-4">
        Account &amp; notifications
      </Link>
    </GroupFrame>
  );
}
