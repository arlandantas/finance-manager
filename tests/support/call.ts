import { randomUUID } from "node:crypto";

declare global {
  interface ImportMeta {
    glob<T>(pattern: string): Record<string, () => Promise<T>>;
  }
}

type Handler = (
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;
type RouteModule = Partial<Record<"GET" | "POST" | "PATCH" | "PUT" | "DELETE", Handler>>;

// Todas as rotas da aplicação, carregadas sob demanda (Vite glob).
const modules = import.meta.glob<RouteModule>("/src/app/api/**/route.ts");

type Route = { regex: RegExp; keys: string[]; load: () => Promise<RouteModule> };

const routes: Route[] = Object.entries(modules)
  .map(([file, load]) => {
    const pattern = file.replace("/src/app", "").replace(/\/route\.ts$/, "");
    const keys: string[] = [];
    const source = pattern
      .split("/")
      .map((seg) => {
        const m = /^\[(?:\.\.\.)?(.+)\]$/.exec(seg);
        if (!m) return seg.replace(/[.*+?^${}()|\\]/g, "\\$&");
        keys.push(m[1] as string);
        return "([^/]+)";
      })
      .join("/");
    return { regex: new RegExp(`^${source}$`), keys, load, specificity: pattern.split("[").length };
  })
  .sort((a, b) => a.specificity - b.specificity);

export type Caller = { cookie: string; userId: string; email: string };

export type CallResult<T = any> = {
  status: number;
  body: T;
  headers: Headers;
};

export type CallOptions = {
  /** `null` suprime o cabeçalho; padrão: UUID novo nas mutações. */
  idempotencyKey?: string | null;
  origin?: string | null;
  headers?: Record<string, string>;
  host?: string;
};

export const ORIGIN = "http://localhost:3100";

/** Invoca o Route Handler diretamente (SDD-006 §3.4), injetando sessão e Origin. */
export async function call<T = any>(
  as: Caller | null,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  opts: CallOptions = {},
): Promise<CallResult<T>> {
  const pathname = path.split("?")[0] as string;
  const route = routes.find((r) => r.regex.test(pathname));
  if (!route) throw new Error(`Rota não encontrada: ${path}`);
  const match = route.regex.exec(pathname) as RegExpExecArray;
  const params = Object.fromEntries(
    route.keys.map((k, i) => [k, decodeURIComponent(match[i + 1] as string)]),
  );
  const mod = await route.load();
  const handler = mod[method];
  if (!handler) throw new Error(`Método ${method} não exportado por ${path}`);

  const headers = new Headers({ ...(opts.headers ?? {}) });
  if (as) headers.set("cookie", as.cookie);
  if (method !== "GET") {
    if (opts.origin !== null) headers.set("origin", opts.origin ?? ORIGIN);
    headers.set("content-type", "application/json");
    if (opts.idempotencyKey !== null)
      headers.set("idempotency-key", opts.idempotencyKey ?? randomUUID());
  }
  headers.set("host", opts.host ?? "localhost:3100");
  const req = new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    ...(method !== "GET" && body !== undefined
      ? { body: typeof body === "string" ? body : JSON.stringify(body) }
      : {}),
  });
  const res = await handler(req, { params: Promise.resolve(params) });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed as T, headers: res.headers };
}
