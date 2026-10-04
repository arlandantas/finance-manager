import { expect } from "@playwright/test";
import { testDb } from "../../support/db";
import { makeFamily } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When } from "../support/fixtures";

const db = testDb();

Given("que {string} nunca acessou o sistema", async ({}, email: string) => {
  expect(await db.user.count({ where: { email } })).toBe(0);
});

Given("não existe convite pendente para esse e-mail", async () => {
  // Nada a criar: o banco do cenário começa limpo.
});

// O caminho real do Google é coberto por testes de integração do callback `signIn` (ADR-008 §5);
// no E2E o login usa o provedor de teste.
When("ela clica em {string} e autoriza", async ({ page, world }, _botao: string) => {
  const email = "mariana@exemplo.com";
  await loginAs(page, { email, name: "Mariana Silva" });
  world.data.email = email;
  await gotoReady(page, "/");
});

Then("uma conta de usuário é criada com o nome, o e-mail e a foto do Google", async () => {
  const user = await db.user.findUnique({ where: { email: "mariana@exemplo.com" } });
  expect(user).not.toBeNull();
  expect(user?.name).toBe("Mariana Silva");
  expect(user?.emailVerified).not.toBeNull();
  // A foto vem do perfil do Google (EXT-01); o login de teste não tem foto e usa as iniciais.
});

Then("ela é levada ao onboarding para criar a família", async ({ page }) => {
  await expect(page).toHaveURL(/\/onboarding$/);
});

Given("que {string} já pertence à {string}", async ({ world }, _email: string, nome: string) => {
  world.family = await makeFamily({ name: nome });
});

When("ele entra com o Google", async ({ page }) => {
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  await gotoReady(page, "/");
});

Then("ele chega à Home da {string}", async ({ page }, nome: string) => {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("family-name")).toHaveText(nome);
});

Then("vê seu nome e sua foto no cabeçalho", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Menu do usuário Lucas Silva" })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("img", { name: /Lucas Silva/ })).toBeVisible();
});

Given("que Lucas entrou ontem e não saiu", async ({ page, world }) => {
  world.family = await makeFamily();
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
});

When("ele reabre o navegador e acessa o sistema", async ({ page, context, world }) => {
  await page.close();
  const fresh = await context.newPage();
  await gotoReady(fresh, "/");
  world.data.page = fresh;
});

Then("ele continua autenticado, sem tela de login", async ({ world }) => {
  const fresh = world.data.page as import("@playwright/test").Page;
  await expect(fresh).toHaveURL(/\/$/);
  await expect(fresh.getByTestId("family-name")).toHaveText("Família Silva");
  await expect(fresh.getByRole("button", { name: "Entrar (teste)" })).toHaveCount(0);
});

Given("que não há sessão ativa", async ({ context }) => {
  await context.clearCookies();
});

When("acesso diretamente a tela {string}", async ({ page, world }, tela: string) => {
  world.family = await makeFamily();
  await gotoReady(page, `/${tela.toLowerCase()}`);
});

Then("sou redirecionado ao login", async ({ page }) => {
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fcontas$/);
  await expect(page.getByRole("heading", { name: "Finance Manager" })).toBeVisible();
});

Then("após entrar, volto para a tela {string}", async ({ page }, tela: string) => {
  await page.getByRole("button", { name: "Lucas" }).click();
  await expect(page).toHaveURL(new RegExp(`/${tela.toLowerCase()}$`));
});

Given("que estou na tela de login", async ({ page }) => {
  await gotoReady(page, "/login");
});

// Cancelamento simulado: o Auth.js devolve ao /login com `?error=AccessDenied` (SDD-003 §8).
When("clico em {string} e cancelo na janela do Google", async ({ page }, _botao: string) => {
  await gotoReady(page, "/login?error=AccessDenied");
});

Then("volto ao login com a mensagem {string}", async ({ page }, mensagem: string) => {
  await expect(page).toHaveURL(/\/login\?error=AccessDenied$/);
  await expect(page.getByRole("alert").filter({ hasText: mensagem })).toBeVisible();
});

Given("uma conta Google cujo e-mail não está verificado", async () => {
  // Sem usuário prévio; o callback `signIn` nega antes de criar qualquer registro.
});

When("tento entrar", async ({ page }) => {
  await gotoReady(page, "/login?error=EmailNotVerified");
});

Then("o acesso é negado com mensagem clara", async ({ page }) => {
  await expect(page.locator("main [role=alert]")).toContainText(
    "Seu e-mail do Google não está verificado",
  );
});

Given("que o ambiente é local com {string}", async ({ page }, _flag: string) => {
  await gotoReady(page, "/login");
  await expect(page.getByText("Entrar como (teste)")).toBeVisible();
});

When("escolho um usuário de teste na tela de login", async ({ page }) => {
  await page.getByRole("button", { name: "Mariana" }).click();
});

Then("sou autenticado sem passar pelo Google", async ({ page }) => {
  await expect(page).not.toHaveURL(/\/login/);
  const me = await page.request.get("/api/v1/me");
  expect(me.status()).toBe(200);
});

Then("o fluxo seguinte \\(família ou convite\\) é o mesmo do login Google", async ({ page }) => {
  await expect(page).toHaveURL(/\/onboarding$/);
});

Given("que estou autenticado", async ({ page, world }) => {
  world.family = await makeFamily();
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  await gotoReady(page, "/");
});

When("clico em {string}", async ({ page, world }, nome: string) => {
  if (nome === "Sair") {
    world.data.sessionsBefore = await db.session.count({
      where: { userId: world.family?.byName.Lucas?.userId },
    });
    await page.getByRole("button", { name: "Menu do usuário Lucas Silva" }).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();
  }
});

Then("a sessão é encerrada", async ({ page, world }) => {
  await expect(page).toHaveURL(/\/login/);
  const me = await page.request.get("/api/v1/me");
  expect(me.status()).toBe(401);
  const after = await db.session.count({ where: { userId: world.family?.byName.Lucas?.userId } });
  expect(after).toBe((world.data.sessionsBefore as number) - 1);
});

Then("sou levado à tela de login", async ({ page }) => {
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Finance Manager" })).toBeVisible();
});
