import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { loginAs } from "../../support/login";
import type { World } from "./fixtures";

const ORIGIN = "http://localhost:3101";

export async function loginAsMember(world: World, page: Page, who: "Mariana" | "Lucas") {
  await loginAs(page, { email: `${who.toLowerCase()}@exemplo.com`, name: `${who} Silva` });
  world.data.loggedAs = who;
}

/** Cria a análise pela API (mesma rota da tela), com a sessão de quem pediu. */
export async function createAnalysisVia(
  world: World,
  page: Page,
  who: "Mariana" | "Lucas",
  period: string,
): Promise<string> {
  await loginAsMember(world, page, who);
  const pv = await page.request.get(`/api/v1/ai/spending-analysis/preview?period=${period}`);
  const { previewHash } = (await pv.json()) as { previewHash: string };
  const r = await page.request.post("/api/v1/ai/spending-analyses", {
    data: { period, previewHash },
    headers: { origin: ORIGIN, "idempotency-key": randomUUID() },
  });
  expect(r.status()).toBe(201);
  const body = (await r.json()) as { id: string };
  world.data.analysisId = body.id;
  const ids = (world.data.analysisIds as Record<string, string> | undefined) ?? {};
  ids[period] = body.id;
  world.data.analysisIds = ids;
  return body.id;
}
