import { getClock } from "@/lib/clock";
import { handleMcp } from "@/modules/mcp/handler";
import { mcpDb } from "@/modules/mcp/repo";
import { mcpTools } from "@/modules/mcp/tools";

// SDD-024 §5.1 (+ §11.1): stateless, sem nada em memória; maxDuration 30 (ADR-031 §2).
export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return handleMcp(req, { db: mcpDb(), clock: getClock(), tools: mcpTools });
}

const notAllowed = () =>
  new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    }),
    {
      status: 405,
      headers: { allow: "POST", "content-type": "application/json" },
    },
  );
export const GET = notAllowed;
export const DELETE = notAllowed;
