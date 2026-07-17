import { processScheduledLayoutPublications } from "@/lib/ui-layout-scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (process.env.UI_LAYOUT_SCHEDULER_ENABLED !== "true") {
    return Response.json({ disabled: true, ok: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  try {
    const result = await processScheduledLayoutPublications();
    return Response.json({ ok: true, ...result }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "ui_layout_scheduler_failed",
      message: error instanceof Error ? error.message : "Unknown scheduler error",
    }));
    return Response.json({ ok: false, error: "Scheduled layout processing failed." }, { status: 500 });
  }
}
