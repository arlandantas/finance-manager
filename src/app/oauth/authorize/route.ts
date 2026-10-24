import { NextResponse } from "next/server";
import { getClock } from "@/lib/clock";
import { validateAuthorize } from "@/modules/mcp/authorize";
import { clientIp } from "@/modules/mcp/client-ip";
import { mcpEnabled } from "@/modules/mcp/config";
import { mcpDb } from "@/modules/mcp/repo";

// SDD-024 §4.3. Endpoint (não página) para que o proxy não mande ao login ANTES de gravar o pedido:
// valida, grava `oauth_authorization_requests` e redireciona para a tela de consentimento (URL curta).
export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  if (!mcpEnabled()) return new Response(null, { status: 404 });
  const url = new URL(req.url);
  const out = await validateAuthorize(mcpDb(), url.searchParams, getClock(), {
    ip: clientIp(req.headers),
  });
  const base = process.env.APP_URL?.replace(/\/+$/, "") || url.origin;
  if (out.kind === "ok") {
    return NextResponse.redirect(`${base}/oauth/consent?request=${out.requestId}`, {
      status: 302,
      headers: NO_STORE,
    });
  }
  if (out.kind === "redirect-error") {
    return NextResponse.redirect(out.location, { status: 302, headers: NO_STORE });
  }
  // cliente/redirect inválido: tela de erro, sem redirecionar para o redirect_uri apresentado
  return NextResponse.redirect(`${base}/oauth/consent?error=${out.reason}`, {
    status: 302,
    headers: NO_STORE,
  });
}
