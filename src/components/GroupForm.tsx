"use client";

import { useMemo, useState, type FormEvent } from "react";
import { deviceTimeZone, useBrowser } from "@/lib/client";
import { cityName, convertHour, DAY_START_HOUR, formatHour, slotOrder, windowHours } from "@/lib/time";
import { Button, ErrorText, Field, Input, Select } from "./ui";

export type GroupValues = { name: string; timezone: string; firstHour: number; lastHour: number };

const allZones = () =>
  ((Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []).join(",");

// Hours in day order, 04:00 … 03:00, since a day runs from 04:00 to 04:00.
const DAY_HOURS = Array.from({ length: 24 }, (_, i) => (i + DAY_START_HOUR) % 24);

export function GroupForm({
  initial,
  submitLabel,
  readOnly = false,
  onSubmit,
}: {
  initial: GroupValues;
  submitLabel: string;
  readOnly?: boolean;
  onSubmit: (values: GroupValues) => Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const myZone = useBrowser(deviceTimeZone, initial.timezone);
  const zoneList = useBrowser(allZones, "");
  const zones = useMemo(
    () => Array.from(new Set([initial.timezone, ...zoneList.split(",").filter(Boolean)])).sort(),
    [zoneList, initial.timezone],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof GroupValues>(key: K, value: GroupValues[K]) => {
    setSaved(false);
    setValues((v) => {
      const next = { ...v, [key]: value };
      if (slotOrder(next.lastHour) < slotOrder(next.firstHour)) next.lastHour = next.firstHour;
      return next;
    });
  };

  const drops = windowHours(values.firstHour, values.lastHour).length;
  const otherZone = myZone !== values.timezone;
  const summary = useMemo(
    () =>
      otherZone
        ? `That's ${convertHour(values.firstHour, values.timezone, myZone)}–${convertHour(values.lastHour, values.timezone, myZone)} on your clock (${cityName(myZone)}).`
        : null,
    [otherZone, values, myZone],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Group name">
        <Input value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={40} required disabled={readOnly} placeholder="Name your group" />
      </Field>
      <Field label="Time zone" hint="Drop times follow this clock, wherever each person is.">
        <Select value={values.timezone} onChange={(e) => set("timezone", e.target.value)} disabled={readOnly}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First drop">
          <Select value={values.firstHour} onChange={(e) => set("firstHour", Number(e.target.value))} disabled={readOnly}>
            {DAY_HOURS.map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Last drop">
          <Select value={values.lastHour} onChange={(e) => set("lastHour", Number(e.target.value))} disabled={readOnly}>
            {DAY_HOURS.filter((h) => slotOrder(h) >= slotOrder(values.firstHour)).map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="text-sm text-muted">
        {drops} hourly {drops === 1 ? "drop" : "drops"} a day, {formatHour(values.firstHour)}–{formatHour(values.lastHour)}{" "}
        {cityName(values.timezone)} time. No notifications outside these hours. {summary}
      </p>
      <ErrorText>{error}</ErrorText>
      {readOnly ? (
        <p className="text-xs text-muted">Only the group owner can change these.</p>
      ) : (
        <Button type="submit" busy={busy}>
          {saved ? "Saved ✓" : submitLabel}
        </Button>
      )}
    </form>
  );
}
