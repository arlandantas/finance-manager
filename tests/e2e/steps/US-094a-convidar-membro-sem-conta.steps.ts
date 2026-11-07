import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { makeInvitation, makeUnlinkedMember } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { Given, Then, When } from "../support/fixtures";

const db = testDb();
const memberRow = (p: Page, n: string) =>
  p.getByTestId("member-row").filter({ has: p.getByText(n, { exact: true }) });
const dialog = (p: Page) => p.getByRole("dialog", { name: "Convidar para o app" });

Given(
  "que existe o membro {string} com o e-mail cadastrado {string}",
  async ({ world, page }, n: string, email: string) => {
    await makeUnlinkedMember(world.family as never, { name: n, pendingEmail: email });
    await gotoReady(page, "/familia");
  },
);
Given("Mariana já convidou {string}", async ({ world, page }, n: string) => {
  const m = await db.member.findFirstOrThrow({ where: { name: n } });
  const inv = await makeInvitation(world.family as never, {
    email: m.pendingEmail as string,
    createdAt: new Date(),
  });
  await db.invitation.update({ where: { id: inv.id }, data: { memberId: m.id } });
  await gotoReady(page, "/familia");
});

When("Mariana convida {string} pelo menu", async ({ page }, n: string) => {
  const first = n.split(" ")[0];
  await memberRow(page, n)
    .getByRole("button", { name: `Ações de ${first}` })
    .click();
  await page.getByRole("menuitem", { name: "Convidar" }).click();
  await expect(dialog(page)).toBeVisible();
});
When("Mariana envia o convite vinculado", async ({ page }) => {
  await dialog(page).getByRole("button", { name: "Enviar convite" }).click();
  await expect(dialog(page)).toBeHidden();
});
When("Mariana cancela o convite de {string}", async ({ page }, n: string) => {
  await memberRow(page, n).getByRole("button", { name: "Cancelar convite" }).click();
  await page.getByRole("button", { name: "Sim, cancelar convite" }).click();
});

Then("vê o aviso do convite {string}", async ({ page }, t: string) => {
  await expect(dialog(page).getByTestId("invite-unlinked-notice")).toHaveText(t);
});
Then("o campo e-mail já vem com {string}", async ({ page }, email: string) => {
  await expect(dialog(page).getByLabel("E-mail")).toHaveValue(email);
});
Then(
  "{string} mostra o selo {string} com {string}, {string} e {string}",
  async ({ page }, n: string, selo: string, a: string, b: string, c: string) => {
    const row = memberRow(page, n);
    await expect(row.getByText(selo, { exact: true })).toBeVisible();
    for (const name of [a, b, c]) {
      await expect(row.getByRole("button", { name })).toBeVisible();
    }
  },
);
Then("{string} não mostra mais o selo {string}", async ({ page }, n: string, selo: string) => {
  await expect(memberRow(page, n).getByText(selo, { exact: true })).toHaveCount(0);
});
Then("{string} volta a ter a ação {string} no menu", async ({ page }, n: string, a: string) => {
  await memberRow(page, n)
    .getByRole("button", { name: `Ações de ${n}` })
    .click();
  await expect(page.getByRole("menuitem", { name: a })).toBeVisible();
});
