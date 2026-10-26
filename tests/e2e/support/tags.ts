import { expect, type Page } from "@playwright/test";
import { drawer } from "./lancamento";

/** Combobox de tags do formulário de lançamento (abre a linha "+ Tag" se ainda recolhida). */
export async function tagBox(page: Page, scope: "drawer" | "page" = "drawer") {
  const root = scope === "drawer" ? drawer(page) : page.getByRole("dialog").last();
  const input = root.getByRole("combobox", { name: "Tags" });
  if (!(await input.isVisible())) {
    await root.getByRole("button", { name: "+ Tag" }).click();
    await expect(input).toBeVisible();
  }
  return { root, input };
}

/** Digita e confirma cada tag com Enter. */
export async function typeTags(page: Page, names: string[], scope: "drawer" | "page" = "drawer") {
  const { input } = await tagBox(page, scope);
  await input.focus();
  for (const n of names) {
    await input.fill(n);
    await input.press("Enter");
  }
}

export const chipsOf = (root: ReturnType<Page["locator"]>) => root.getByTestId("tag-chip");
