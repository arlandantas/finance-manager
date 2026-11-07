import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { makeUnlinkedMember } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { Given, Then, When } from "../support/fixtures";

const db = testDb();
const rows = (p: Page) => p.getByTestId("member-row");
const rowOf = (p: Page, n: string) => rows(p).filter({ has: p.getByText(n, { exact: true }) });
const dialog = (p: Page) => p.getByRole("dialog", { name: "Editar membro" });

async function openEdit(page: Page, n: string) {
  await rowOf(page, n)
    .getByRole("button", { name: `Ações de ${n.split(" ")[0]}` })
    .click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  await expect(dialog(page)).toBeVisible();
}

Given("que existe o membro {string} sem e-mail para editar", async ({ world, page }, n: string) => {
  await makeUnlinkedMember(world.family as never, { name: n });
  await gotoReady(page, "/familia");
});
Given(
  "que existe o membro {string} com o e-mail para editar {string}",
  async ({ world, page }, n: string, email: string) => {
    await makeUnlinkedMember(world.family as never, { name: n, pendingEmail: email });
    await gotoReady(page, "/familia");
  },
);

When(
  "Mariana edita {string} trocando o nome para {string}",
  async ({ page }, n: string, to: string) => {
    await openEdit(page, n);
    await dialog(page).getByLabel("Nome").fill(to);
    await dialog(page).getByRole("button", { name: "Salvar" }).click();
    await expect(dialog(page)).toBeHidden();
  },
);
When("Mariana edita {string} removendo o e-mail", async ({ page }, n: string) => {
  await openEdit(page, n);
  await dialog(page).getByRole("button", { name: "Remover e-mail" }).click();
  await expect(dialog(page)).toBeHidden();
});

Then(
  "a lista da família mostra {string} com o selo {string}",
  async ({ page }, n: string, selo: string) => {
    await expect(rowOf(page, n).getByText(selo, { exact: true })).toBeVisible();
  },
);
Then("a lista da família não mostra mais {string} como membro", async ({ page }, n: string) => {
  await expect(rowOf(page, n)).toHaveCount(0);
});
Then("{string} continua na lista sem mostrar o e-mail", async ({ page }, n: string) => {
  const row = rowOf(page, n);
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId("member-pending-email")).toHaveCount(0);
  const m = await db.member.findFirstOrThrow({ where: { name: n } });
  expect(m.pendingEmail).toBeNull();
  expect(m.removedAt).toBeNull();
});
