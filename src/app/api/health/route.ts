import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/modules/cron/purge";
import { checkHealth, toPublicHealth } from "@/modules/health/check-health";
import { pingDatabase } from "@/modules/health/repo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const full = await checkHealth(pingDatabase);
  const detailed = isAuthorizedCron(req.headers.get("authorization"), process.env.CRON_SECRET);
  const health = detailed ? full : toPublicHealth(full);
  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
