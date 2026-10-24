import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/modules/cron/purge";
import { purgeAll } from "@/modules/cron/repo";

// ADR-031 §8: Vercel Cron diário (vercel.json). GET com `Authorization: Bearer $CRON_SECRET`.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autorizado" } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const results = await purgeAll(new Date());
  return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
}
