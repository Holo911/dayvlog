"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function GroupTabs({ groupId }: { groupId: string }) {
  const path = usePathname();
  const tabs = [
    { href: "/?home", match: "/", label: "Groups", icon: icons.groups },
    { href: `/g/${groupId}`, match: `/g/${groupId}`, label: "Today", icon: icons.today },
    { href: `/g/${groupId}/calendar`, match: `/g/${groupId}/calendar`, label: "Days", icon: icons.days },
    { href: `/g/${groupId}/settings`, match: `/g/${groupId}/settings`, label: "Settings", icon: icons.settings },
  ];
  return (
    <>
      <div className="h-20" aria-hidden />
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-md">
          {tabs.map((t) => {
            const active = path === t.match;
            return (
              <Link
                key={t.label}
                href={t.href}
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
