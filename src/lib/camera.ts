"use client";

// Camera helpers for the record screen. On iPhones, facingMode "environment" opens the
// back "Dual Wide"/"Triple" camera, whose zoom range starts at 0.5 (the ultra-wide lens),
// so lens changes are just zoom values and happen without restarting the camera.

export type Facing = "user" | "environment";

export async function openCamera(facing: Facing) {
  // Ask for a 3:4 portrait frame: on phones 4:3 is the sensor's full view, while 16:9
  // video crops the sides away and looks zoomed in.
  const video: MediaTrackConstraints = {
    facingMode: { ideal: facing },
    width: { ideal: 1080 },
    height: { ideal: 1440 },
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
