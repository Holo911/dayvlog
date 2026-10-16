"use client";

import { api } from "./client";

/**
 * Posts a clip: the server picks the slot and hands out an upload URL, the phone uploads the
 * video straight to storage, then the clip is published.
 */
export async function uploadClip(groupId: string, blob: Blob, durationMs: number, caption: string) {
  const contentType = blob.type || "video/mp4";
  const start = await api<{ clipId: string; upload: { url: string; headers: Record<string, string> } }>("/api/clips", {
    body: { groupId, contentType, sizeBytes: blob.size },
  });
  const put = await fetch(start.upload.url, { method: "PUT", headers: start.upload.headers, body: blob });
  if (!put.ok) throw new Error(`Upload failed (${put.status}). Check your connection and try again.`);
  await api(`/api/clips/${start.clipId}/complete`, {
    body: { durationMs: Math.round(durationMs), caption: caption.trim() || undefined },
  });
}
