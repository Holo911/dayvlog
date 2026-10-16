"use client";

import { useParams } from "next/navigation";
import { AppleCamera } from "@/components/record/AppleCamera";
import { InAppCamera } from "@/components/record/InAppCamera";
import { useCameraMode } from "@/lib/camera";
import { searchParam, useApi, useBrowser, type GroupInfo } from "@/lib/client";

export default function RecordPage() {
  const { id } = useParams<{ id: string }>();
  const { data: info } = useApi<GroupInfo>(`/api/groups/${id}`);
  const mode = useCameraMode();
  // Dev-only: /record?fake forces the in-app camera with a generated test video.
  const fake = useBrowser(searchParam("fake"), null) !== null && process.env.NODE_ENV === "development";

  return mode === "inapp" || fake ? <InAppCamera groupId={id} info={info} /> : <AppleCamera groupId={id} info={info} />;
}
