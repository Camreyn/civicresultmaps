import { redirect } from "next/navigation";

import { buildEquipmentStateSocialPreview } from "@/lib/equipment-social-preview";

type SearchValue = string | string[] | undefined;

export default async function EquipmentStateRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const requested = await searchParams;
  const value = Array.isArray(requested.state) ? requested.state[0] : requested.state;
  const state = value?.trim().toUpperCase() ?? "";
  if (buildEquipmentStateSocialPreview(state)) redirect(`/equipment/state/${state}`);
  redirect("/equipment");
}
