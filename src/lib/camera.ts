"use client";

// Camera helpers for the record screen. On iPhones, facingMode "environment" opens the
// back "Dual Wide"/"Triple" camera, whose zoom range starts at 0.5 (the ultra-wide lens),
// so lens changes are just zoom values and happen without restarting the camera.

import { useSyncExternalStore } from "react";

export type Facing = "user" | "environment";

// Which camera Record opens, remembered per device:
// - "inapp" (default): horizontal viewfinder inside the app, exactly 2.5 s. On iPhone, iOS
//   asks for camera permission again most times (Home Screen web apps can't keep it).
// - "apple": Apple's own camera through a file input, which never asks for permission; you
//   then pick 2.5 s and the app crops it to the same horizontal clip.
export type CameraMode = "apple" | "inapp";
const MODE_KEY = "dayvlog:cameraMode";
const modeListeners = new Set<() => void>();

export function getCameraMode(): CameraMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === "apple" || saved === "inapp") return saved;
  } catch {
    // Storage unavailable: fall through to the default.
  }
  return "inapp";
}

export function setCameraMode(mode: CameraMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Not remembered, but still applies until the app closes.
  }
  modeListeners.forEach((l) => l());
}

function subscribeMode(listener: () => void) {
  modeListeners.add(listener);
  return () => modeListeners.delete(listener);
}

/** Server render uses "apple" on purpose: it has no side effects, unlike opening the live camera. */
export function useCameraMode() {
  return useSyncExternalStore(subscribeMode, getCameraMode, () => "apple" as CameraMode);
}

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

export async function openCamera(facing: Facing) {
  // Ask for a 3:4 portrait frame (the sensor's full view on phones), 1440 px wide: the clip is
  // a horizontal 16:9 band across the full width, so width is what gives it detail.
  const video: MediaTrackConstraints = {
    facingMode: { ideal: facing },
    width: { ideal: 1440 },
    height: { ideal: 1920 },
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

/** One line describing the live camera, shown when you tap the hour label (for debugging on a phone). */
export function describeTrack(track: MediaStreamTrack) {
  const s = track.getSettings();
  const z = zoomRange(track);
  return `${s.width}×${s.height} · ${track.label || "camera"}${z ? ` · zoom ${z.min}–${z.max}` : " · no zoom control"}`;
}
