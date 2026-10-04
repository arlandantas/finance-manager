import type { ApiErrorBody } from "@/lib/api/errors";
import type { ApiResult } from "@/lib/api/types";

export function jsonResponse(result: ApiResult, requestId?: string): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...result.headers,
  });
  if (requestId) headers.set("X-Request-Id", requestId);
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}

export function errorResponse(status: number, body: ApiErrorBody, requestId?: string): Response {
  return jsonResponse({ status, body }, requestId);
}
