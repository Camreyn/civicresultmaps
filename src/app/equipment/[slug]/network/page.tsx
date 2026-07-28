import type { Route } from "next";
import { permanentRedirect } from "next/navigation";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function EquipmentNetworkRedirectPage({ params }: PageProps) {
  const { slug } = await params;
  permanentRedirect(`/equipment/${slug}/topology` as Route);
}
