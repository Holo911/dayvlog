"use client";

// Camera helpers for the record screen. On iPhones, facingMode "environment" opens the
// back "Dual Wide"/"Triple" camera, whose zoom range starts at 0.5 (the ultra-wide lens),
// so lens changes are just zoom values and happen without restarting the camera.

export type Facing = "user" | "environment";

const MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/** Best recording format this browser supports (MP4 on iPhone). */
export function pickMime() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * `shape` must match the screen: iOS keeps the size you asked for when the screen rotates, so
 * portrait settings on a landscape screen gave a cut-down, zoomed-in picture. The camera is
 * reopened whenever the screen orientation changes.
 */
export async function openCamera(facing: Facing, shape: "portrait" | "landscape") {
  // 4:3 is the sensor's full view on phones; the 16:9 clip is cut from it.
  const long = 1920;
  const short = 1440;
  const video: MediaTrackConstraints = {
    facingMode: { ideal: facing },
    width: { ideal: shape === "landscape" ? long : short },
    height: { ideal: shape === "landscape" ? short : long },
    frameRate: { ideal: 30 },
  };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: true });
  } catch (err) {
    // Microphone refused but camera may still be allowed: record silent clips.
    if ((err as Error).name === "NotAllowedError" || (err as Error).name === "NotFoundError") {
      return navigator.mediaDevices.getUserMedia({ video, audio: false });
    }
    throw err;
  }
}

type ZoomCaps = { min: number; max: number };

/** Zoom range the browser lets us control, if any (Safari on iOS, Chrome on Android). */
export function zoomRange(track: MediaStreamTrack): ZoomCaps | null {
  const caps = track.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: ZoomCaps }) | undefined;
  if (!caps?.zoom || !(caps.zoom.max > caps.zoom.min)) return null;
  return { min: caps.zoom.min, max: Math.min(caps.zoom.max, 10) };
}

/** iPhone-style preset buttons that fit the range: 0.5× (ultra wide, back camera only), 1×, 2×. */
export function quickZooms({ min, max }: ZoomCaps) {
  return [0.5, 1, 2].filter((z) => z >= min - 0.01 && z <= max + 0.01);
}

export function setZoom(track: MediaStreamTrack, zoom: number) {
  return track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
}

/** Whether the browser lets us switch this camera's light on (the back camera's flash). */
export function torchSupported(track: MediaStreamTrack) {
  const caps = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
  return Boolean(caps?.torch);
}

export function setTorch(track: MediaStreamTrack, on: boolean) {
  return track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
}

/** One line describing the live camera, shown when you tap the hour label (for debugging on a phone). */
export function describeTrack(track: MediaStreamTrack) {
  const s = track.getSettings();
  const z = zoomRange(track);
  return [
    `${s.width}×${s.height}`,
    track.label || "camera",
    z ? `zoom ${z.min}–${z.max}` : "no zoom control",
    torchSupported(track) ? "flash ok" : "no flash control",
  ].join(" · ");
}
