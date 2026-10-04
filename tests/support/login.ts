import { expect, type Page } from "@playwright/test";

/** SDD-003 §3.3: autentica pelo endpoint de teste; o cookie fica no contexto do navegador. */
export async function loginAs(page: Page, user: { email: string; name?: string }) {
  const res = await page.request.post("/api/dev/login", { data: user });
  expect(res.status(), "dev-login deve responder 200").toBe(200);
}
