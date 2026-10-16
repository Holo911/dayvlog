"use client";

import { pickMime } from "./camera";

// Every clip is a horizontal 16:9 video, like Setlog's: horizontal clips stack full width one
// above the other in the split screen without cropping anyone. You film holding the phone
// sideways. If the page itself rotated to landscape, camera frames arrive landscape and are
// centre-cropped to 16:9. If the page stayed portrait (rotation lock on, the usual case), the
// frames arrive portrait with the scene turned on its side, so they are rotated back while
// drawing. Either way the clip uses the sensor's full width.

export const CLIP_W = 1280;
export const CLIP_H = 720;
export const CLIP_ASPECT = CLIP_W / CLIP_H;
const VIDEO_BPS = 5_000_000;
const AUDIO_BPS = 128_000;

/** Region of a `w`×`h` frame with the given aspect (width/height), centred, as large as fits. */
function centreRegion(w: number, h: number, aspect: number) {
  const sw = Math.min(w, h * aspect);
  const sh = sw / aspect;
  return { sx: (w - sw) / 2, sy: (h - sh) / 2, sw, sh };
}

/**
 * Part of the camera frame that ends up in the clip. `sideways`: the phone is held sideways
 * while the page is portrait, so the clip's 16:9 is 9:16 in frame coordinates. The camera
 * preview shows exactly this region (aspect-[9/16] or aspect-video with object-cover).
 */
export function clipRegion(frameW: number, frameH: number, sideways: boolean) {
  return centreRegion(frameW, frameH, sideways ? CLIP_H / CLIP_W : CLIP_W / CLIP_H);
}

/**
 * A 1280×720 canvas plus a MediaRecorder for it (with any audio tracks given). Paint frames
 * with `draw(video, sideways)`; returns null if this browser can't record a canvas.
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

  const draw = (video: HTMLVideoElement, sideways: boolean) => {
    if (!video.videoWidth) return;
    const { sx, sy, sw, sh } = clipRegion(video.videoWidth, video.videoHeight, sideways);
    if (sideways) {
      // Held with the phone's top to the left: the frame's right edge is "up" in the world.
      // Rotate a quarter turn anticlockwise: (x, y) → (y, CLIP_H − x).
      ctx.setTransform(0, -1, 1, 0, 0, CLIP_H);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, CLIP_H, CLIP_W);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, CLIP_W, CLIP_H);
    }
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
