import { POST as decision } from "@/app/api/oauth/authorize/decision/route";
import { POST as token } from "@/app/api/oauth/token/route";
import type { Caller } from "./call";

export const ORIGIN = "http://localhost:3100";

/** Decisão com Origin arbitrário (teste de CSRF). */
export function decisionPOST(member: Caller, body: unknown, origin: string) {
  return decision(
    new Request(`${ORIGIN}/api/oauth/authorize/decision`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        host: "localhost:3100",
        cookie: member.cookie,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );
}

/** /token com corpo e content-type arbitrários. */
export function tokenPOST(body: string, contentType: string) {
  return token(
    new Request(`${ORIGIN}/api/oauth/token`, {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    }),
  );
}

/** URL do PRM esperada no WWW-Authenticate (SDD-024 §5.1). */
export const prmUrlForTest = () => `${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`;
