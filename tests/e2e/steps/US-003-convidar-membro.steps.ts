import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { type FamilyFixture, makeFamily, makeInvitation } from "../../support/factories";
import { loginAs } from "../../support/login";
import { clearMessages, waitForMessage } from "../../support/mailpit";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();

const ADMIN_ONLY = [
  { email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" as const },
];

async function adminFamily(world: World, page: Page, o: { nome?: string; soAdmin?: boolean } = {}) {
  await clearMessages();
  world.family = await makeFamily({
    name: o.nome ?? "Família Silva",
    ...(o.soAdmin === false ? {} : { members: ADMIN_ONLY }),
  });
  await loginAs(page, { email: "mariana@exemplo.com", name: "Mariana Silva" });
  world.data.loggedAs = "Mariana";
}

async function openInviteDrawer(page: Page) {
  await gotoReady(page, "/familia");
  await page.getByRole("button", { name: "Convidar membro" }).first().click();
  await expect(page.getByRole("dialog", { name: "Convidar membro" })).toBeVisible();
}

async function sendInvite(page: Page, email: string, papel?: string) {
  const dialog = page.getByRole("dialog", { name: "Convidar membro" });
  await dialog.getByLabel("E-mail Google").fill(email);
  if (papel) await dialog.getByLabel("Papel").selectOption({ label: papel });
  await dialog.getByRole("button", { name: "Enviar convite" }).click();
}

const fx = (world: World) => world.family as FamilyFixture;

Given("que Mariana é Administradora da {string}", async ({ page, world }, nome: string) => {
  await adminFamily(world, page, { nome });
});

When(
  "ela convida {string} com papel {string}",
  async ({ page, world }, email: string, papel: string) => {
    await openInviteDrawer(page);
    await sendInvite(page, email, papel);
    await expect(page.getByRole("dialog", { name: "Convidar membro" })).toBeHidden();
    world.data.inviteEmail = email;
  },
);

Then("um convite pendente é criado com validade de {int} dias", async ({}, dias: number) => {
  const inv = await db.invitation.findFirstOrThrow();
  expect(inv.status).toBe("PENDING");
  expect(inv.role).toBe("MEMBER");
  // relógio do E2E: 2026-10-04T15:00:00Z (playwright.config.ts)
  expect(inv.expiresAt.toISOString()).toBe(
    new Date(Date.UTC(2026, 9, 4 + dias, 15, 0, 0)).toISOString(),
  );
  expect(inv.tokenHash).toMatch(/^[0-9a-f]{64}$/);
});

Then("um e-mail com o link de acesso é enviado para {string}", async ({}, para: string) => {
  const mail = await waitForMessage(para);
  expect(mail.subject).toBe("Mariana Silva convidou você para a Família Silva no Finance Manager");
  expect(mail.text).toMatch(/http:\/\/localhost:3101\/convite\/[\w-]+/);
});

Then("o convite aparece em {string}", async ({ page, world }, secao: string) => {
  const section = page.getByRole("region", { name: secao });
  await expect(section.getByTestId("invitation-row")).toHaveCount(1);
  await expect(section).toContainText(world.data.inviteEmail as string);
  await expect(section).toContainText(/Expira em \d+ dias?/);
});

Given("que existe um convite pendente para {string}", async ({ world }, email: string) => {
  world.family = await makeFamily({ members: ADMIN_ONLY });
  const inv = await makeInvitation(world.family, { email });
  world.data.token = inv.token;
  world.data.inviteEmail = email;
});

When("Lucas entra com o Google usando {string}", async ({ page }, email: string) => {
  await loginAs(page, { email, name: "Lucas Silva" });
  await gotoReady(page, "/");
});

Then("ele é vinculado à {string} com o papel do convite", async ({}, nome: string) => {
  const user = await db.user.findUniqueOrThrow({ where: { email: "lucas@exemplo.com" } });
  const member = await db.member.findUniqueOrThrow({
    where: { userId: user.id },
    include: { family: true },
  });
  expect(member.family.name).toBe(nome);
  expect(member.role).toBe("MEMBER");
});

Then("o convite passa a {string}", async ({}, estado: string) => {
  const inv = await db.invitation.findFirstOrThrow();
  expect(inv.status).toBe(estado === "aceito" ? "ACCEPTED" : estado);
  expect(inv.acceptedAt).not.toBeNull();
});

Then("ele vê a mensagem {string}", async ({ page }, mensagem: string) => {
  // O parâmetro ?joined=1 é limpo da URL, mas o aviso continua na tela.
  await expect(page).not.toHaveURL(/joined=1/);
  await expect(page.getByText(mensagem, { exact: true })).toBeVisible();
});

When("alguém entra com {string} pelo link do convite", async ({ page, world }, email: string) => {
  await loginAs(page, { email, name: "Outra Pessoa" });
  await gotoReady(page, `/convite/${world.data.token as string}`);
});

Then("não é vinculado à família", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: "outra@exemplo.com" } });
  expect(await db.member.count({ where: { userId: user.id } })).toBe(0);
  expect((await db.invitation.findFirstOrThrow()).status).toBe("PENDING");
});

Then("vê a mensagem {string}", async ({ page }, mensagem: string) => {
  await expect(page.getByText(mensagem, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar com outra conta" })).toBeVisible();
});

Given("que estou no drawer de convite", async ({ page, world }) => {
  await adminFamily(world, page);
  await openInviteDrawer(page);
});

When("informo {string} e tento enviar", async ({ page }, email: string) => {
  await sendInvite(page, email);
});

Then("nenhum convite é criado", async () => {
  expect(await db.invitation.count()).toBe(0);
});

Given("que {string} já é membro da família", async ({ page, world }, email: string) => {
  await adminFamily(world, page, { soAdmin: false });
  world.data.inviteEmail = email;
});

Given("que já existe convite pendente para {string}", async ({ page, world }, email: string) => {
  await adminFamily(world, page);
  await makeInvitation(fx(world), { email });
  world.data.inviteEmail = email;
});

When("tento convidá-lo novamente", async ({ page, world }) => {
  await openInviteDrawer(page);
  await sendInvite(page, world.data.inviteEmail as string);
});

Given("um convite pendente para {string}", async ({ world }, email: string) => {
  world.family = await makeFamily({ members: ADMIN_ONLY });
  const inv = await makeInvitation(world.family, { email });
  world.data.token = inv.token;
  world.data.inviteEmail = email;
});

When("o Administrador clica em {string}", async ({ page, world }, acao: string) => {
  await loginAs(page, { email: "mariana@exemplo.com", name: "Mariana Silva" });
  await gotoReady(page, "/familia");
  await page.getByRole("button", { name: acao }).click();
  await page.getByRole("button", { name: "Sim, cancelar convite" }).click();
  await expect(page.getByTestId("invitation-row")).toHaveCount(0);
  world.data.loggedAs = "Mariana";
});

Then("o convite deixa de valer", async () => {
  expect((await db.invitation.findFirstOrThrow()).status).toBe("CANCELED");
});

Then("Lucas, ao entrar, cai no onboarding de nova família", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3101" });
  const page2 = await ctx.newPage();
  await loginAs(page2, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  await gotoReady(page2, "/");
  await expect(page2).toHaveURL(/\/onboarding$/);
  await expect(page2.getByText("Convite expirado")).toHaveCount(0);
  await ctx.close();
});

Given("um convite emitido há mais de 7 dias", async ({ world }) => {
  world.family = await makeFamily({ members: ADMIN_ONLY });
  await makeInvitation(world.family, {
    email: "lucas@exemplo.com",
    createdAt: new Date("2026-09-20T12:00:00Z"),
    expiresAt: new Date("2026-09-27T12:00:00Z"),
  });
});

When("o convidado entra com o Google", async ({ page }) => {
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  await gotoReady(page, "/");
});

Then("ele não é vinculado", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: "lucas@exemplo.com" } });
  expect(await db.member.count({ where: { userId: user.id } })).toBe(0);
});

Given("que Lucas tem papel {string}", async ({ page, world }, _papel: string) => {
  world.family = await makeFamily();
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  world.data.loggedAs = "Lucas";
});

When("ele acessa a tela {string}", async ({ page }, tela: string) => {
  await gotoReady(page, `/${tela.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}`);
  await expect(page.getByRole("heading", { name: tela, exact: true })).toBeVisible();
});

Then("a ação {string} não está disponível", async ({ page }, acao: string) => {
  await expect(page.getByTestId("member-row")).toHaveCount(2);
  await expect(page.getByRole("button", { name: acao })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Convites pendentes" })).toHaveCount(0);
});
