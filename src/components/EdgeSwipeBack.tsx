"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isStandalone } from "@/lib/client";

// Apps opened from the iPhone Home Screen don't get Safari's swipe-from-the-edge "back",
// so we add it: drag from the left edge to go up one screen (the same place the ‹ goes).

const EDGE_PX = 28;
const TRIGGER_PX = 80;

function parentOf(path: string) {
  const g = /^\/g\/([^/]+)(\/.*)?$/.exec(path);
  if (g) return g[2] ? `/g/${g[1]}` : "/?home";
  if (path === "/settings" || path === "/new" || path.startsWith("/join")) return "/?home";
  return null;
}

export function EdgeSwipeBack() {
  const router = useRouter();
  const path = usePathname();
  const start = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(0);

  useEffect(() => {
    const target = parentOf(path);
    if (!target || !isStandalone()) return;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      // The vlog player has its own swipes; let it handle them.
      const inPlayer = (e.target as Element | null)?.closest?.("[data-no-edge-swipe]");
      start.current = e.touches.length === 1 && t.clientX < EDGE_PX && !inPlayer ? { x: t.clientX, y: t.clientY } : null;
    };
    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const t = e.touches[0];
      const dx = t.clientX - start.current.x;
      if (Math.abs(t.clientY - start.current.y) > 60 && dx < 40) {
        start.current = null;
        setDrag(0);
      } else setDrag(Math.max(0, dx));
    };
    const onEnd = (e: TouchEvent) => {
      if (!start.current) return;
      const dx = e.changedTouches[0].clientX - start.current.x;
      start.current = null;
      setDrag(0);
      if (dx > TRIGGER_PX) router.push(target);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [path, router]);

  if (!drag) return null;
  const progress = Math.min(1, drag / TRIGGER_PX);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 top-1/2 z-50 grid size-11 place-items-center rounded-full bg-white text-black shadow-lg"
      style={{ transform: `translate(${progress * 28 - 16}px, -50%)`, opacity: 0.4 + progress * 0.6 }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </div>
  );
}
