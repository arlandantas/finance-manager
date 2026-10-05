// Cliente HTTP do navegador para /api/v1 (SDD-000 §2 e §7).
export type ApiErrorPayload = {
  error: { code: string; message: string; details?: unknown };
};

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export class NetworkError extends Error {
  constructor() {
    super("Sem conexão. Seus dados continuam na tela, tente de novo.");
    this.name = "NetworkError";
  }
}

type Options = { method?: string; body?: unknown; idempotencyKey?: string; signal?: AbortSignal };

export async function apiFetch<T>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {};
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  }
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new NetworkError();
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (data as ApiErrorPayload | null)?.error;
    throw new ApiClientError(
      res.status,
      err?.code ?? "INTERNAL",
      err?.message ?? "Erro inesperado.",
      err?.details,
    );
  }
  return data as T;
}

/**
 * UUID v4 para Idempotency-Key. `crypto.randomUUID` só existe em contexto seguro (https/localhost); em dev
 * por IP da LAN (http://192.168.x.x) ele é indefinido, então cai para getRandomValues.
 */
export const newIdempotencyKey = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array;
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
