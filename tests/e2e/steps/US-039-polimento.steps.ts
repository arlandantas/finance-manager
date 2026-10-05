import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { makeInvitation } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { family, setupCouple } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();
// distância entre o campo de valor e o campo seguinte (o modal é centralizado, então só a distância relativa vale)
async function gap(page: Page): Promise<number> {
  const d = page.getByRole("dialog", { name: "Transferir" });
  const a = await d.getByLabel("Valor", { exact: true }).boundingBox();
  const b = await d.getByLabel("Conta de origem").boundingBox();
  return (b?.y ?? 0) - (a?.y ?? 0);
}
const toast = (p: Page, t: string) => p.locator("[data-sonner-toast]").filter({ hasText: t });

async function as(world: World, page: Page, who: "Mariana" | "Lucas") {
  await loginAs(page, { email: `${who.toLowerCase()}@exemplo.com`, name: `${who} Silva` });
  world.data.loggedAs = who;
}
Given("a família do polimento com Mariana Administradora e Lucas Membro", async ({ world }) => {
  await setupCouple(world);
});

When(
  "Mariana tenta transferir {string} e vê {string}",
  async ({ world, page }, v: string, msg: string) => {
    await as(world, page, "Mariana");
    await gotoReady(page, "/contas");
    await page.getByRole("button", { name: "Transferir" }).first().click();
    const d = page.getByRole("dialog", { name: "Transferir" });
    await d.getByLabel("Valor", { exact: true }).fill(v);
    await d
      .getByRole("button", { name: /^Transferir$|Salvar|Confirmar/ })
      .last()
      .click();
    await expect(d.getByText(msg)).toBeVisible();
  },
);
When("anota a posição do campo abaixo do valor", async ({ world, page }) => {
  const b = page.getByRole("dialog", { name: "Transferir" }).getByLabel("Conta de origem");
  const a = await page
    .getByRole("dialog", { name: "Transferir" })
    .getByLabel("Valor", { exact: true })
    .boundingBox();
  world.data.btnY = ((await b.boundingBox())?.y ?? 0) - (a?.y ?? 0);
});
When("Mariana digita {string} no valor da transferência", async ({ page }, v: string) => {
  await page
    .getByRole("dialog", { name: "Transferir" })
    .getByLabel("Valor", { exact: true })
    .fill(v);
});
Then("a mensagem {string} desaparece", async ({ page }, m: string) => {
  await expect(page.getByRole("dialog", { name: "Transferir" }).getByText(m)).toHaveCount(0);
});
Then("a posição do campo abaixo do valor não muda", async ({ world, page }) => {
  const b = page.getByRole("dialog", { name: "Transferir" }).getByLabel("Conta de origem");
  const a = await page
    .getByRole("dialog", { name: "Transferir" })
    .getByLabel("Valor", { exact: true })
    .boundingBox();
  const y = ((await b.boundingBox())?.y ?? 0) - (a?.y ?? 0);
  expect(Math.abs(y - (world.data.btnY as number))).toBeLessThanOrEqual(1);
});

When("Mariana abre o menu do avatar do polimento", async ({ world, page }) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/");
  await page.getByRole("button", { name: /^Menu do usuário/ }).click();
});
Then("vê {string} e dentro dele {string}", async ({ page }, g: string, item: string) => {
  const grp = page.getByRole("group", { name: g });
  await expect(grp).toBeVisible();
  await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
});

Given("um convite pendente do polimento para {string}", async ({ world }, email: string) => {
  const inv = await makeInvitation(family(world), { email, invitedBy: "Mariana" });
  world.data.inv = inv;
});
Given(
  "um convite pendente do polimento para {string} vencido",
  async ({ world }, email: string) => {
    const inv = await makeInvitation(family(world), {
      email,
      invitedBy: "Mariana",
      createdAt: new Date("2026-09-01T12:00:00Z"),
    });
    world.data.inv = inv;
  },
);
When("Mariana toca em {string} no convite do polimento", async ({ world, page }, b: string) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/familia");
  await page.getByTestId("invitation-row").getByRole("button", { name: b }).click();
});
Then("vê o aviso {string} com {string}", async ({ page }, a: string, b: string) => {
  const t = toast(page, a);
  await expect(t).toBeVisible();
  await expect(t).toContainText(b);
});
Then("o link anterior não abre mais o convite", async ({ world, page }) => {
  const old = (world.data.inv as { token: string }).token;
  await gotoReady(page, `/convite/${old}`);
  await expect(page.getByText("Este convite não é mais válido.")).toBeVisible();
});
Given("que o convite já foi reenviado 3 vezes", async ({ world }) => {
  const inv = world.data.inv as { id: string };
  await db.invitation.update({ where: { id: inv.id }, data: { resendCount: 3 } });
});
When(
  "Mariana recarrega a tela Família e toca em {string} no convite do polimento",
  async ({ page }, b: string) => {
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
    await page.getByTestId("invitation-row").getByRole("button", { name: b }).click();
  },
);
Then("vê o erro de convite {string}", async ({ page }, m: string) => {
  await expect(
    page.getByTestId("invitation-row").getByRole("alert").filter({ hasText: m }),
  ).toBeVisible();
});
When("Mariana abre a tela Família do polimento", async ({ world, page }) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/familia");
});
Then("o botão do convite {string} fica desabilitado", async ({ page }, b: string) => {
  await expect(page.getByTestId("invitation-row").getByRole("button", { name: b })).toBeDisabled();
});
When("Mariana abre o formulário de convite do polimento", async ({ world, page }) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/familia");
  await page.getByRole("button", { name: "Convidar membro" }).first().click();
});
When("Lucas abre a tela Família do polimento", async ({ world, page }) => {
  await as(world, page, "Lucas");
  await gotoReady(page, "/familia");
  await expect(page.getByTestId("family-title")).toBeVisible();
});
Then("não vê {string} nem {string}", async ({ page }, a: string, b: string) => {
  await expect(page.getByRole("button", { name: a })).toHaveCount(0);
  await expect(page.getByRole("button", { name: b })).toHaveCount(0);
});

const filtersRegion = (p: Page) =>
  p.getByRole("dialog", { name: "Filtros" }).or(p.getByRole("region", { name: "Filtros" }));
When("Mariana abre o Extrato do polimento", async ({ world, page }) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/extrato");
});
When("Mariana filtra o Extrato por membro {string}", async ({ page }, n: string) => {
  const toggle = page.getByRole("button", { name: /^Filtros/ });
  if (await toggle.isVisible()) await toggle.click();
  const sel = filtersRegion(page).getByLabel(/^Membro/);
  const v = await sel.locator("option", { hasText: n }).first().getAttribute("value");
  await sel.selectOption(v as string);
  const close = page.getByRole("button", { name: "Ver resultados" });
  if (await close.isVisible()) await close.click();
});
Then(
  "o filtro de membro anuncia {string} e o botão {string} aparece",
  async ({ page }, anuncio: string, b: string) => {
    const toggle = page.getByRole("button", { name: /^Filtros/ });
    if (await toggle.isVisible()) await toggle.click();
    await expect(filtersRegion(page).getByLabel(anuncio)).toBeVisible();
    const close = page.getByRole("button", { name: "Ver resultados" });
    if (await close.isVisible()) await close.click();
    await expect(page.getByRole("button", { name: b }).first()).toBeVisible();
  },
);
When("Mariana toca em {string} do Extrato", async ({ page }, b: string) => {
  await page.getByRole("button", { name: b }).first().click();
});
Then(
  "o filtro de membro anuncia {string} e o botão {string} some",
  async ({ page }, anuncio: string, b: string) => {
    await expect(page.getByRole("button", { name: b })).toHaveCount(0); // some inclusive o do estado vazio
    const toggle = page.getByRole("button", { name: /^Filtros/ });
    if (await toggle.isVisible()) await toggle.click();
    await expect(filtersRegion(page).getByLabel(anuncio)).toBeVisible();
  },
);
