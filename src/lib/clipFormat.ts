"use client";

import { pickMime } from "./camera";

// Every clip is a horizontal 16:9 video, like Setlog's: horizontal clips stack full width one
// above the other in the split screen without cropping anyone. Phones film upright, so the
// recorder crops a horizontal band out of the camera picture (the preview shows exactly that
// band) and re-encodes it at a decent bitrate.

export const CLIP_W = 1280;
export const CLIP_H = 720;
export const CLIP_ASPECT = CLIP_W / CLIP_H;
const VIDEO_BPS = 5_000_000;
const AUDIO_BPS = 128_000;

/** Source rectangle that centre-crops a `srcW`×`srcH` frame to the clip shape. */
export function cropToClip(srcW: number, srcH: number) {
  const scale = Math.max(CLIP_W / srcW, CLIP_H / srcH);
  const sw = CLIP_W / scale;
  const sh = CLIP_H / scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

/**
 * A 1280×720 canvas plus a MediaRecorder for it (with any audio tracks given). Paint frames
 * with `draw(video)`; returns null if this browser can't record a canvas.
 */
export function createClipRecorder(audioTracks: MediaStreamTrack[]) {
  const mimeType = pickMime();
  const canvas = document.createElement("canvas");
  canvas.width = CLIP_W;
  canvas.height = CLIP_H;
  const ctx = canvas.getContext("2d");
  if (!mimeType || !ctx || typeof canvas.captureStream !== "function") return null;

  const stream = canvas.captureStream(30);
  audioTracks.forEach((t) => stream.addTrack(t));
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: VIDEO_BPS, audioBitsPerSecond: AUDIO_BPS });
  } catch {
    return null;
  }

  const draw = (video: HTMLVideoElement) => {
    if (!video.videoWidth) return;
    const { sx, sy, sw, sh } = cropToClip(video.videoWidth, video.videoHeight);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, CLIP_W, CLIP_H);
  };

  /** Resolves with the finished clip once `stop()` is called. */
  const finished = new Promise<Blob>((resolve) => {
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
  });

  return {
    draw,
    start: () => recorder.start(),
    stop: () => recorder.state === "recording" && recorder.stop(),
    finished,
  };
}
