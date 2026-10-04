import { getDb } from "@/lib/db";

export const pingDatabase = () => getDb().$queryRaw`SELECT 1`;
