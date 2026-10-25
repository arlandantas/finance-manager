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

Given("que Lucas entrou com o Google e vê o convite", async ({ page }) => {
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  await gotoReady(page, "/");
  await expect(page).toHaveURL(/\/convites$/);
});

Then("vê os botões {string} e {string}", async ({ page }, a: string, b: string) => {
  await expect(page.getByRole("button", { name: a })).toBeVisible();
  await expect(page.getByRole("button", { name: b, exact: true })).toBeVisible();
});

Then("não é vinculado a nenhuma família ainda", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: "lucas@exemplo.com" } });
  expect(await db.member.count({ where: { userId: user.id } })).toBe(0);
});

Given("que o convite foi cancelado por Mariana", async () => {
  await db.invitation.updateMany({ data: { status: "CANCELED", canceledAt: new Date() } });
});

When("Lucas aciona {string}", async ({ page }, botao: string) => {
  const done = page.waitForResponse((r) =>
    /\/me\/invitations\/.+\/(accept|decline)$/.test(r.url()),
  );
  await page.getByRole("button", { name: botao, exact: true }).click();
  await done;
});

When("Lucas recusa pelo botão {string}", async ({ page }, botao: string) => {
  await page.getByRole("button", { name: botao, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Quem convidou verá que você recusou.");
  const done = page.waitForResponse((r) => r.url().endsWith("/decline"));
  await dialog.getByRole("button", { name: "Recusar convite" }).click();
  await done;
});

Then("Lucas não é vinculado a nenhuma família", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: "lucas@exemplo.com" } });
  expect(await db.member.count({ where: { userId: user.id } })).toBe(0);
});

Then("Lucas segue para criar a própria família", async ({ page }) => {
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: "Crie sua família" })).toBeVisible();
});

Given(
  "que existem convites pendentes para {string} da {string} e da {string}",
  async ({ world }, email: string, a: string, b: string) => {
    world.family = await makeFamily({ name: a, members: ADMIN_ONLY });
    await makeInvitation(world.family, { email });
    const other = await makeFamily({
      name: b,
      members: [{ email: "carlos@exemplo.com", name: "Carlos Souza", role: "ADMIN" }],
    });
    await makeInvitation(other, { email });
  },
);

Then(
  "vê um cartão para a {string} e outro para a {string}",
  async ({ page }, a: string, b: string) => {
    await expect(page.getByTestId("invitation-card")).toHaveCount(2);
    await expect(page.getByTestId("invitation-card").filter({ hasText: a })).toHaveCount(1);
    await expect(page.getByTestId("invitation-card").filter({ hasText: b })).toHaveCount(1);
  },
);

Given(
  "que Lucas já faz parte da {string} e tem um convite da {string}",
  async ({ world }, souza: string, silva: string) => {
    world.family = await makeFamily({ name: silva, members: ADMIN_ONLY });
    const inv = await makeInvitation(world.family, { email: "lucas@exemplo.com" });
    world.data.token = inv.token;
    await makeFamily({
      name: souza,
      members: [
        { email: "carlos@exemplo.com", name: "Carlos Souza", role: "ADMIN" },
        { email: "lucas@exemplo.com", name: "Lucas Silva", role: "MEMBER" },
      ],
    });
  },
);

When("Lucas abre o link do convite e toca em {string}", async ({ page, world }, botao: string) => {
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  await gotoReady(page, `/convite/${world.data.token as string}`);
  const done = page.waitForResponse((r) => r.url().endsWith("/accept"));
  await page.getByRole("button", { name: botao, exact: true }).click();
  await done;
});

Then("o convite da {string} continua pendente", async ({ world }, nome: string) => {
  const inv = await db.invitation.findFirstOrThrow({ where: { family: { name: nome } } });
  expect(inv.status).toBe("PENDING");
  void world;
});

When(
  "Lucas abre o link do convite com a conta Google de {string}",
  async ({ page, world }, email: string) => {
    await loginAs(page, { email, name: "Lucas Silva" });
    await gotoReady(page, `/convite/${world.data.token as string}`);
  },
);

Then("ele é vinculado à {string} com o papel do convite", async ({}, nome: string) => {
  const user = await db.user.findUniqueOrThrow({ where: { email: "lucas@exemplo.com" } });
  const member = await db.member.findFirstOrThrow({
    where: { userId: user.id, removedAt: null },
    include: { family: true },
  });
  expect(member.family.name).toBe(nome);
  expect(member.role).toBe("MEMBER");
});

Then("o convite passa a {string}", async ({}, estado: string) => {
  const inv = await db.invitation.findFirstOrThrow({
    where: { family: { name: "Família Silva" } },
  });
  if (estado === "aceito") {
    expect(inv.status).toBe("ACCEPTED");
    expect(inv.acceptedAt).not.toBeNull();
  } else {
    expect(inv.status).toBe("DECLINED");
    expect(inv.declinedAt).not.toBeNull();
  }
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
