import type { Page } from "@playwright/test";

/** `goto` que só retorna depois da hidratação do React (ver `HydrationMarker`). */
export async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
}

/**
 * Recarrega a página já aberta (se houver) depois de semear/apagar dados no banco: o cache do React Query
 * do drawer ("Pagar com", cartões) é do carregamento anterior e ficaria desatualizado.
 */
export async function reloadIfOpen(page: Page) {
  if (!page.url().startsWith("http")) return;
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
}
