"use client";

import { isIos, isStandalone, useBrowser } from "@/lib/client";

/** iPhone only delivers notifications to web apps opened from the Home Screen, so say so. */
export function InstallHint({ always = false }: { always?: boolean }) {
  const show = useBrowser(() => !isStandalone() && (always || isIos()), false);
  if (!show) return null;
  return (
    <div className="rounded-3xl border border-line bg-raised p-4 text-sm leading-relaxed">
      <p className="mb-2 font-semibold">Add Day Vlog to your Home Screen</p>
      <ol className="list-decimal space-y-1 pl-5 text-muted">
        <li>
          Tap the <b className="text-ink">Share</b> button in Safari (or <b className="text-ink">•••</b> then Share).
        </li>
        <li>
          Choose <b className="text-ink">Add to Home Screen</b>.
        </li>
        <li>
          Open <b className="text-ink">Day Vlog</b> from your Home Screen and sign in there. Notifications only work in the
          installed app.
        </li>
      </ol>
    </div>
  );
}
