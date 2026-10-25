import { expect } from "@playwright/test";
import { hashSessionToken } from "@/lib/auth/session";
import { testDb } from "../../support/db";
import { asUser } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { Given, Then, When } from "../support/fixtures";

const db = testDb();
const userId = async (email: string) => (await db.user.findUniqueOrThrow({ where: { email } })).id;

Given("que Lucas só tem a sessão deste aparelho", async ({ page }) => {
  // o cenário de fábrica cria sessões extras; deixa só a do navegador
  const cookie = (await page.context().cookies()).find((c) => c.name === "authjs.session-token");
  const keep = hashSessionToken(cookie?.value as string);
  await db.session.deleteMany({
    where: { userId: await userId("lucas@exemplo.com"), NOT: { tokenHash: keep } },
  });
});

Given("que Lucas também está conectado em outro aparelho", async () => {
  await asUser("lucas@exemplo.com", { name: "Lucas Silva" });
});

Given("que Mariana está conectada no próprio aparelho", async () => {
  await asUser("mariana@exemplo.com", { name: "Mariana Silva" });
});

When("Lucas abre o menu do usuário e toca em {string}", async ({ page }, item: string) => {
  await page.getByRole("button", { name: /Menu do usuário/ }).click();
  await page.getByRole("menuitem", { name: item }).click();
});

Then("a confirmação diz {string}", async ({ page }, texto: string) => {
  await expect(page.getByRole("dialog")).toContainText(texto);
});

When("Lucas confirma encerrar", async ({ page }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Encerrar", exact: true }).click();
});

When("Lucas cancela o encerramento", async ({ page }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
});

Then("vê o aviso de sessões {string}", async ({ page }, texto: string) => {
  await expect(page.getByText(texto)).toBeVisible();
});

Then("o outro aparelho do Lucas não tem mais sessão", async () => {
  expect(await db.session.count({ where: { userId: await userId("lucas@exemplo.com") } })).toBe(1);
});

Then("o outro aparelho do Lucas continua com sessão", async () => {
  expect(await db.session.count({ where: { userId: await userId("lucas@exemplo.com") } })).toBe(2);
});

Then("este aparelho continua conectado", async ({ page }) => {
  await page.reload();
  await expect(page.getByRole("button", { name: /Menu do usuário/ })).toBeVisible();
});

Then("a sessão da Mariana continua ativa", async () => {
  expect(
    await db.session.count({ where: { userId: await userId("mariana@exemplo.com") } }),
  ).toBeGreaterThan(0);
});
