import { getClock } from "@/lib/clock";
import { mcpEnabled } from "@/modules/mcp/config";
import { oauthFormResponse, readForm } from "@/modules/mcp/http";
import { mcpDb } from "@/modules/mcp/repo";
import { handleTokenRequest } from "@/modules/mcp/token-endpoint";

// SDD-024 §4.5. Corpo `application/x-www-form-urlencoded`; JSON => 400 invalid_request.
export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!mcpEnabled()) return new Response(null, { status: 404 });
  const form = await readForm(req);
  if (!form) {
    return oauthFormResponse({
      status: 400,
      body: {
        error: "invalid_request",
        error_description: "Use application/x-www-form-urlencoded.",
      },
    });
  }
  return oauthFormResponse(await handleTokenRequest(mcpDb(), form, getClock().now()));
}
