import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { checkHealth } from "@/modules/health/check-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await checkHealth(() => getDb().$queryRaw`SELECT 1`);
  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
