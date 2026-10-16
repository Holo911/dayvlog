"use client";

import { useParams } from "next/navigation";
import { InAppCamera } from "@/components/record/InAppCamera";
import { useApi, type GroupInfo } from "@/lib/client";

export default function RecordPage() {
  const { id } = useParams<{ id: string }>();
  const { data: info } = useApi<GroupInfo>(`/api/groups/${id}`);
  return <InAppCamera groupId={id} info={info} />;
}
