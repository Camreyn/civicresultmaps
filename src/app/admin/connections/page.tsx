import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireResearchActor, ResearchAccessError } from "@/lib/connection-research-auth";
import { readResearchWorkspace } from "@/lib/connection-research-repository";
import { ResearchEditor } from "./research-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connections research", robots: { index: false, follow: false } };
export default async function ResearchPage() {
  try {
    const actor = await requireResearchActor();
    const workspace = await readResearchWorkspace();
    return <ResearchEditor initial={workspace} publisher={actor.publisher} />;
  } catch (error) {
    if (error instanceof ResearchAccessError && error.status === 401) redirect("/admin/sign-in?redirect_url=%2Fadmin%2Fconnections" as Route);
    return <main style={{ padding: 32 }}><h1>Connections research</h1><p>{error instanceof ResearchAccessError ? error.message : "Research database unavailable. Configure and migrate the approved research database before editing."}</p><a href="/connections">Public connections</a></main>;
  }
}
