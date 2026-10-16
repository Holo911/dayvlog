"use client";

import { useEffect, useSyncExternalStore } from "react";

// Clips downloaded into memory, shared by the group screen's live preview and the player:
// whatever the preview already fetched starts instantly in the player. iPhones ignore video
// preload hints, so streaming a clip only when it is due made playback start half-loaded.

type ClipRef = { id: string; url: string };

const urls = new Map<string, string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadClip(clip: ClipRef) {
  if (urls.has(clip.id) || pending.has(clip.id)) return;
  pending.add(clip.id);
  fetch(clip.url)
    .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((blob) => URL.createObjectURL(blob))
    // If the download fails, stream it directly rather than skipping the clip.
    .catch(() => clip.url)
    .then((url) => {
      urls.set(clip.id, url);
      pending.delete(clip.id);
      emit();
    });
}

/** Local URLs for the clips that are downloaded so far; starts downloading the rest. */
export function useClipUrls(clips: ClipRef[]) {
  useSyncExternalStore(subscribe, () => version, () => 0);
  const key = clips.map((c) => c.id).join(",");
  useEffect(() => {
    clips.forEach(loadClip);
    // `key` changes exactly when the set of clips does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const out: Record<string, string> = {};
  for (const c of clips) {
    const u = urls.get(c.id);
    if (u) out[c.id] = u;
  }
  return out;
}
