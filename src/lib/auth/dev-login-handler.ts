import type { z } from "zod";
import { zodDetails } from "@/lib/api/with-api";
import { createDevSession } from "@/lib/auth/dev-login";
import { isDevLoginEnabled, isLocalHost } from "@/lib/auth/dev-login-guard";
import { SECURE_SESSION_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { DevLoginSchema } from "@/modules/familia/schemas";

// ADR-008: provedor de login de teste. 404 (corpo vazio) quando desativado.
export async function handleDevLogin(req: Request): Promise<Response> {
  if (!isDevLoginEnabled()) return new Response(null, { status: 404 });
  if (!isLocalHost(req.headers.get("host"))) {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "Login de teste disponível apenas em localhost." } },
      { status: 403 },
    );
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json(
      { error: { code: "INVALID_JSON", message: "Corpo da requisição inválido." } },
      { status: 400 },
    );
  }
  const parsed = DevLoginSchema.safeParse(raw);
  if (!parsed.success) {
    const details = zodDetails(parsed.error as z.ZodError);
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: details[0]?.message ?? "Dados inválidos.",
          details,
        },
      },
      { status: 400 },
    );
  }
  const { user, sessionToken, expires } = await createDevSession(getDb(), parsed.data);
  const secure = getEnv().AUTH_URL.startsWith("https://");
  const cookie = [
    `${secure ? SECURE_SESSION_COOKIE : SESSION_COOKIE}=${sessionToken}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    `Expires=${expires.toUTCString()}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
  return new Response(
    JSON.stringify({ user: { id: user.id, email: user.email, name: user.name } }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie,
        "Cache-Control": "no-store",
      },
    },
  );
}
