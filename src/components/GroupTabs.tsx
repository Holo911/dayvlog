"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const icons = {
  today: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  days: <path d="M8 3v4M16 3v4M3.5 9.5h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5z" />,
  group: <path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM21 19v-1a4 4 0 0 0-3-3.9M15.5 4.1a3 3 0 0 1 0 5.8" />,
};

export function GroupTabs({ groupId }: { groupId: string }) {
  const path = usePathname();
  const tabs = [
    { href: `/g/${groupId}`, label: "Today", icon: icons.today },
    { href: `/g/${groupId}/calendar`, label: "Days", icon: icons.days },
    { href: `/g/${groupId}/settings`, label: "Group", icon: icons.group },
  ];
  return (
    <>
      <div className="h-20" aria-hidden />
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-md">
          {tabs.map((t) => {
            const active = path === t.href;
            return (
              <Link
                key={t.href}
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
