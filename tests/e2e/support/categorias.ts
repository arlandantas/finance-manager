import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import type { World } from "./fixtures";

export const dlg = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });

/** Cria categoria direto no banco (arquivada opcional), no fim da ordem da família. */
export async function seedCategory(
  world: World,
  o: { kind: "EXPENSE" | "INCOME"; name: string; archived?: boolean },
) {
  const db = testDb();
  const familyId = world.family?.family.id as string;
  const existing = await db.category.findFirst({
    where: { familyId, kind: o.kind, name: o.name },
  });
  if (existing) {
    if (o.archived && !existing.archivedAt) {
      return db.category.update({
        where: { id: existing.id },
        data: { archivedAt: new Date(), version: { increment: 1 } },
      });
    }
    return existing;
  }
  const agg = await db.category.aggregate({ where: { familyId }, _max: { sortOrder: true } });
  return db.category.create({
    data: {
      familyId,
      kind: o.kind,
      name: o.name,
      icon: "package",
      sortOrder: (agg._max.sortOrder ?? -1) + 1,
      ...(o.archived ? { archivedAt: new Date() } : {}),
    },
  });
}

/** Abre a tela de categorias pelo menu do usuário e escolhe a aba. */
export async function openCategorias(page: Page, aba: "Despesa" | "Receita" = "Despesa") {
  if (!/\/categorias/.test(page.url())) {
    await page.getByRole("button", { name: /^Menu do usuário/ }).click();
    await page.getByRole("menuitem", { name: "Categorias" }).click();
    await expect(page).toHaveURL(/\/categorias/);
  }
  const tab = page.getByRole("tab", { name: aba });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

/** Preenche e salva o drawer "Nova categoria". */
export async function createCategoryViaUi(
  page: Page,
  name: string,
  o: { icon?: string; save?: boolean } = {},
) {
  await page.getByRole("button", { name: "Nova categoria" }).click();
  const d = dlg(page, "Nova categoria");
  await expect(d).toBeVisible();
  await d.getByLabel("Nome", { exact: true }).fill(name);
  if (o.icon) await d.getByRole("radio", { name: o.icon }).click();
  if (o.save !== false) await d.getByRole("button", { name: "Salvar", exact: true }).click();
}
