import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { makeFamily, makeUnlinkedMember } from "../../support/factories";
import { loginAs } from "../../support/login";
import { clearMessages } from "../../support/mailpit";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";
import { drawer, openDrawer } from "../support/lancamento";
import { ensureAccount } from "../support/world";

const db = testDb();
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const memberRow = (p: Page, n: string) =>
  p.getByTestId("member-row").filter({ has: p.getByText(n, { exact: true }) });
const drawerOf = (p: Page) => p.getByRole("dialog", { name: "Cadastrar membro" });

async function familia(world: World, page: Page, who: "Mariana" | "Lucas") {
  await loginAs(page, { email: `${who.toLowerCase()}@exemplo.com`, name: `${who} Silva` });
  world.data.loggedAs = who;
  await gotoReady(page, "/familia");
  await expect(page.getByTestId("family-title")).toBeVisible();
}

async function openRegisterDrawer(page: Page) {
  await page.getByRole("button", { name: "Cadastrar membro" }).click();
  await expect(drawerOf(page)).toBeVisible();
}

async function register(page: Page, name: string, email?: string) {
  await openRegisterDrawer(page);
  await drawerOf(page).getByLabel("Nome", { exact: true }).fill(name);
  if (email) await drawerOf(page).getByLabel("E-mail (opcional)").fill(email);
  await drawerOf(page).getByRole("button", { name: "Cadastrar", exact: true }).click();
}

Given(
  /^a "Família Silva" com os membros "Mariana" \(Administradora\) e "Lucas" \(Membro\) para o cadastro$/,
  async ({ world }) => {
    await clearMessages();
    world.family = await makeFamily();
  },
);
Given("Mariana está autenticada na tela Família", async ({ world, page }) => {
  await familia(world, page, "Mariana");
});
Given("que Lucas está autenticado", async ({ world }) => {
  world.data.loggedAs = "Lucas";
});
Given("que existe o membro {string}", async ({ world, page }, n: string) => {
  await makeUnlinkedMember(world.family as never, { name: n });
  await page.reload();
});
Given("que Mariana cadastrou o membro {string}", async ({ world, page }, n: string) => {
  await makeUnlinkedMember(world.family as never, { name: n });
  await gotoReady(page, "/familia");
});
Given("que {string} usa o e-mail {string}", async ({}, nome: string, email: string) => {
  const u = await db.user.findFirstOrThrow({ where: { name: { startsWith: nome } } });
  expect(u.email).toBe(email);
});

When("Mariana cadastra o membro {string}", async ({ page }, n: string) => {
  await register(page, n);
});
When(
  "Mariana cadastra o membro {string} com o e-mail {string}",
  async ({ page }, n: string, email: string) => {
    await register(page, n, email);
  },
);
When("Lucas abre a tela {string} para o cadastro", async ({ world, page }, _t: string) => {
  await familia(world, page, "Lucas");
});
When("Mariana abre o menu de {string}", async ({ page }, n: string) => {
  await memberRow(page, n)
    .getByRole("button", { name: `Ações de ${n}` })
    .click();
});
When(
  "Mariana abre o formulário {string} para ver as pessoas",
  async ({ page, world }, titulo: string) => {
    await ensureAccount(world);
    await gotoReady(page, "/");
    await openDrawer(page);
    expect(titulo).toBe("Nova despesa");
  },
);
When("Mariana abre o cadastro de membro", async ({ page }) => {
  await openRegisterDrawer(page);
});
When("digita o nome {string}", async ({ page }, n: string) => {
  await drawerOf(page).getByLabel("Nome", { exact: true }).fill(n);
});

Then(
  "vê {string} na lista de membros com o selo {string}",
  async ({ page }, n: string, selo: string) => {
    const row = memberRow(page, n);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("member-unlinked")).toHaveText(selo);
  },
);
Then("{string} não recebe nenhum e-mail", async ({}, _n: string) => {
  const res = await fetch(`${MAILPIT}/api/v1/messages`);
  const data = (await res.json()) as { messages: unknown[] };
  expect(data.messages).toHaveLength(0);
});
Then(
  "{string} aparece em {string} e em {string}",
  async ({ page, world }, n: string, pagou: string, resp: string) => {
    const payers = drawer(page).getByRole("radiogroup", {
      name: pagou,
    });
    await expect(
      payers.getByRole("radio", { name: new RegExp(`^${n}( \\(sem acesso ao app\\))?$`) }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await gotoReady(page, "/previstas");
    await page.getByRole("button", { name: "Nova despesa prevista" }).first().click();
    const dd = page.getByRole("dialog", { name: "Nova despesa prevista" });
    await expect(
      dd
        .getByRole("radiogroup", { name: resp })
        .getByRole("radio", { name: new RegExp(`^${n}( \\(sem acesso ao app\\))?$`) }),
    ).toBeVisible();
    world.data.checked = true;
  },
);
Then(
  "{string} é cadastrada com o e-mail guardado só para o convite",
  async ({ page }, n: string) => {
    await expect(memberRow(page, n)).toBeVisible();
    const row = await db.member.findFirstOrThrow({ where: { name: n } });
    expect(row).toMatchObject({ userId: null, pendingEmail: "ana@exemplo.com" });
    expect(await db.invitation.count()).toBe(0);
    await expect(memberRow(page, n).getByTestId("member-pending-email")).toHaveText(
      "ana@exemplo.com",
    );
  },
);
Then("não vê a ação de cadastro {string}", async ({ page }, a: string) => {
  await expect(page.getByRole("button", { name: "Convidar membro" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: a })).toHaveCount(0);
  await expect(page.getByText(a)).toHaveCount(0);
});
Then("a ação {string} não está disponível no menu do membro", async ({ page }, a: string) => {
  await expect(page.getByRole("menuitem", { name: "Remover" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: a })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Alterar papel" })).toHaveCount(0);
});
Then("o histórico da família mostra {string}", async ({ page }, t: string) => {
  await expect(page.getByTestId("family-event").filter({ hasText: t })).toBeVisible();
});
Then("vê o aviso de divisão {string}", async ({ page }, t: string) => {
  await expect(drawerOf(page).getByTestId("split-notice")).toContainText(t);
});
