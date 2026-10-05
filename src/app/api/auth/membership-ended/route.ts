import { NextResponse } from "next/server";
import { consumeMembershipEnded } from "@/lib/auth/membership-ended";
import { SECURE_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Aviso único de acesso encerrado (ADR-019 §4): leva ao login com a mensagem e encerra a sessão. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const result = await consumeMembershipEnded(req.headers.get("cookie"));
  if (result === "NO_SESSION") return NextResponse.redirect(new URL("/login", origin));
  if (result === "NO_NOTICE") return NextResponse.redirect(new URL("/", origin));
  const res = NextResponse.redirect(new URL("/login?error=MembershipEnded", origin));
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
  res.cookies.set(SECURE_SESSION_COOKIE, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: true,
  });
  return res;
}
