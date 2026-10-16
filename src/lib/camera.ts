"use client";

// Camera helpers for the record screen. iPhones expose every back lens as its own camera
// (ultra wide, wide, telephoto, plus "dual"/"triple" virtual cameras), labelled in the
// phone's language, so lenses are recognised by label in the languages likely in a group.

export type Facing = "user" | "environment";
export type LensKind = "ultra" | "wide" | "tele" | "other";
export type Lens = { deviceId: string; label: string; kind: LensKind; name: string };

const FRONT = /front|前面|インカメ|przedni|전면|vorder|avant|frontal|anterior/i;
const VIRTUAL = /dual|triple|デュアル|トリプル|듀얼|트리플|podwójn|potrójn/i;
const ULTRA = /ultra|超広角|초광각/i;
const TELE = /tele|望遠|망원/i;
const BACK = /back|rear|背面|tylny|후면|environment/i;

const ORDER: LensKind[] = ["ultra", "wide", "tele", "other"];
const NAMES: Record<LensKind, string> = { ultra: "0.5×", wide: "1×", tele: "Tele", other: "" };

function kindOf(label: string): LensKind {
  if (ULTRA.test(label)) return "ultra";
  if (TELE.test(label)) return "tele";
  if (BACK.test(label)) return "wide";
  return "other";
}

/** Physical back lenses in zoom order. Labels are only filled in once camera access is granted. */
export async function listBackLenses(): Promise<Lens[]> {
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) => d.kind === "videoinput" && d.label && !FRONT.test(d.label),
  );
  const physical = cams.filter((d) => !VIRTUAL.test(d.label));
  const pool = physical.length ? physical : cams;
  const lenses = pool
    .map((d) => ({ deviceId: d.deviceId, label: d.label, kind: kindOf(d.label), name: "" }))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  // Unrecognised or repeated kinds (e.g. Android's "camera2 0, facing back") get numbers.
  const seen = new Map<string, number>();
  for (const l of lenses) seen.set(NAMES[l.kind], (seen.get(NAMES[l.kind]) ?? 0) + 1);
  lenses.forEach((l, i) => (l.name = NAMES[l.kind] && seen.get(NAMES[l.kind]) === 1 ? NAMES[l.kind] : String(i + 1)));
  return lenses;
}

export async function openCamera(facing: Facing, deviceId: string | null) {
  // Ask for a 3:4 portrait frame: on phones 4:3 is the sensor's full view, while 16:9
  // video crops the sides away and looks zoomed in.
  const video: MediaTrackConstraints = {
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facing } }),
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

/** Optical/digital zoom range the browser lets us control, if any (Chrome on Android, newer Safari). */
export function zoomRange(track: MediaStreamTrack): ZoomCaps | null {
  const caps = track.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: ZoomCaps }) | undefined;
  if (!caps?.zoom || !(caps.zoom.max > caps.zoom.min)) return null;
  return { min: caps.zoom.min, max: Math.min(caps.zoom.max, 10) };
}

export function setZoom(track: MediaStreamTrack, zoom: number) {
  return track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
}

/** One line describing the live camera, shown when you tap the hour label (for debugging on a phone). */
export function describeTrack(track: MediaStreamTrack) {
  const s = track.getSettings() as MediaTrackSettings & { zoom?: number };
  const z = zoomRange(track);
  return `${s.width}×${s.height} · ${track.label || "camera"}${z ? ` · zoom ${z.min}–${z.max}` : " · no zoom control"}`;
}
