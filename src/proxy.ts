import { type NextRequest, NextResponse } from "next/server";

// SDD-003 §3.4: checagem OTIMISTA do cookie (o proxy não consulta o banco).
// A autoridade é `requireSession()` no servidor e o `withApi`.
const COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname + req.nextUrl.search;
  const hasSession = COOKIES.some((c) => req.cookies.has(c));
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?callbackUrl=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  const headers = new Headers(req.headers);
  headers.set("x-app-path", path);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // `.well-known/` (metadados OAuth/RFC 9728, públicos) e `oauth/authorize` (endpoint que valida o pedido e
  // grava antes do login; a tela de consentimento `/oauth/consent` continua protegida) ficam fora do proxy.
  matcher: [
    "/((?!api/|\\.well-known/|oauth/authorize$|login|convite/|conta-excluida$|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
