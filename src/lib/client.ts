"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export function loginUrl() {
  const here = window.location.pathname + window.location.search;
  return `/login?next=${encodeURIComponent(here)}`;
}

/** Only same-site relative paths, so ?next= can't bounce people to another site. */
export function safeNext(fallback = "/") {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/** Minimal data hook: loads JSON, sends signed-out visitors to /login, refetches on focus. */
export function useApi<T>(path: string | null, { refreshMs }: { refreshMs?: number } = {}) {
  // Results are tagged with their path, so a new path never shows the previous page's data.
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null }>({
    path: null,
    data: null,
    error: null,
  });

  const load = useCallback(async (p: string | null) => {
    if (!p) return;
    try {
      const data = await api<T>(p);
      setState({ path: p, data, error: null });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.replace(loginUrl());
        return;
      }
      setState((s) => ({ ...s, path: p, error: (err as Error).message }));
    }
  }, []);

  useEffect(() => {
    void load(path);
    const onVisible = () => document.visibilityState === "visible" && void load(path);
    document.addEventListener("visibilitychange", onVisible);
    const timer = refreshMs ? setInterval(() => load(path), refreshMs) : undefined;
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearInterval(timer);
    };
  }, [path, refreshMs, load]);

  const current = state.path === path;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    reload: () => load(path),
    setData: (data: T) => setState({ path, data, error: null }),
  };
}

const noSubscribe = () => () => {};

/**
 * A browser-only value (URL params, device time zone, …): the server render and hydration
 * use `serverValue`, then the client switches to the real one. Values must be primitives.
 */
export function useBrowser<T extends string | number | boolean | null>(get: () => T, serverValue: T): T {
  return useSyncExternalStore(noSubscribe, get, () => serverValue);
}

export const searchParam = (name: string) => () => new URLSearchParams(window.location.search).get(name);

/** Re-renders every `ms` so clocks and countdowns stay current. */
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Stable per-person colour for avatars and name tags. */
export function memberColor(userId: string) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 70% 62%)`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => [...w][0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** localStorage key for the group the installed app opens into. */
export const LAST_GROUP = "dayvlog:lastGroup";

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type Me = {
  user: { id: string; name: string; email: string } | null;
  groups: { id: string; name: string; timezone: string; firstHour: number; lastHour: number }[];
};

export type GroupInfo = {
  group: {
    id: string;
    name: string;
    timezone: string;
    firstHour: number;
    lastHour: number;
    inviteCode: string;
    ownerId: string;
  };
  members: { id: string; name: string }[];
  me: { id: string; name: string; notify: boolean; isOwner: boolean };
};

export type DayClip = {
  id: string;
  userId: string;
  userName: string;
  hour: number;
  url: string;
  contentType: string;
  durationMs: number | null;
  caption: string | null;
  createdAt: string;
};
