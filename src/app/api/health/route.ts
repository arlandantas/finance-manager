import { NextResponse } from "next/server";
import { checkHealth } from "@/modules/health/check-health";
import { pingDatabase } from "@/modules/health/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await checkHealth(pingDatabase);
  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
