import { getDb } from "@/lib/db";
import { type PurgeResult, runPurge } from "@/modules/cron/purge";

export function purgeAll(now: Date): Promise<PurgeResult[]> {
  return runPurge(getDb(), now);
}
