import type { Page } from "@playwright/test";

/** `goto` que só retorna depois da hidratação do React (ver `HydrationMarker`). */
export async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
}
