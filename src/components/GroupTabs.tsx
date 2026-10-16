"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./ui";

const icons = {
  groups: <path d="M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z" />,
  today: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  days: <path d="M8 3v4M16 3v4M3.5 9.5h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};

/**
 * Full-screen frame for the tabbed group screens: only the middle scrolls, and the bottom bar
 * is an ordinary part of the frame. Installed iPhone web apps misplace `position: fixed` bars
 * on pages that don't scroll (the bar jumped up on the short Days tab), so the document
 * itself never scrolls here.
 */
export function GroupFrame({ groupId, action, children }: { groupId: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 top-0 flex h-screen flex-col">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <main className="safe-top mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-6">{children}</main>
      </div>
      <GroupTabs groupId={groupId} action={action} />
    </div>
  );
}

/** Bottom bar for a group. `action` (e.g. the Record button) sits just above the tabs. */
function GroupTabs({ groupId, action }: { groupId: string; action?: ReactNode }) {
  const path = usePathname();
  const tabs = [
    { href: "/?home", match: "/", label: "Groups", icon: icons.groups },
    { href: `/g/${groupId}`, match: `/g/${groupId}`, label: "Today", icon: icons.today },
    { href: `/g/${groupId}/calendar`, match: `/g/${groupId}/calendar`, label: "Days", icon: icons.days },
    { href: `/g/${groupId}/settings`, match: `/g/${groupId}/settings`, label: "Settings", icon: icons.settings },
  ];
  return (
    <>
      <nav className="safe-bottom shrink-0 border-t border-line bg-bg">
        {action ? <div className="mx-auto max-w-md px-4 pt-3">{action}</div> : null}
        <div className="mx-auto flex max-w-md">
          {tabs.map((t) => {
            const active = path === t.match;
            return (
              <Link
                key={t.label}
                href={t.href}
                prefetch
                className={cx("flex flex-1 flex-col items-center gap-0.5 pt-2 text-xs", active ? "text-ink" : "text-muted")}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {t.icon}
                </svg>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
