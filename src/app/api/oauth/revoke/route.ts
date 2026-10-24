import { getClock } from "@/lib/clock";
import { mcpEnabled } from "@/modules/mcp/config";
import { oauthFormResponse, readForm } from "@/modules/mcp/http";
import { mcpDb } from "@/modules/mcp/repo";
import { handleRevokeRequest } from "@/modules/mcp/token-endpoint";

// SDD-024 §4.8 (RFC 7009): sempre 200.
export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!mcpEnabled()) return new Response(null, { status: 404 });
  const form = (await readForm(req)) ?? {};
  return oauthFormResponse(await handleRevokeRequest(mcpDb(), form, getClock().now()));
}
