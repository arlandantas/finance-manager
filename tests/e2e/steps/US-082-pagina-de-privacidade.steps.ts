import { expect } from "@playwright/test";
import { gotoReady } from "../../support/nav";
import { Given, Then, When } from "../support/fixtures";

const heading = (p: import("@playwright/test").Page) =>
  p.getByRole("heading", { name: "Privacidade", level: 1 });

Given("uma pessoa que ainda não entrou", async () => {});
Given("um celular de 375 px de largura", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
});

When("ela toca em {string} no rodapé da tela de entrada", async ({ page }, t: string) => {
  await gotoReady(page, "/login");
  await page.getByRole("link", { name: t }).click();
});
When("Lucas abre o Perfil e toca no link {string}", async ({ page }, t: string) => {
  await page.getByRole("button", { name: /Menu do usuário/ }).click();
  await page.getByRole("menuitem", { name: "Perfil e meus dados" }).click();
  await expect(page.getByRole("heading", { name: "Perfil", level: 1 })).toBeVisible();
  await page.getByTestId("link-privacidade").click();
  void t;
});
When("ela abre a página {string}", async ({ page }, _t: string) => {
  await page.goto("/privacidade");
});

Then("vê a página {string} sem precisar entrar", async ({ page }, _t: string) => {
  await expect(page).toHaveURL(/\/privacidade$/);
  await expect(heading(page)).toBeVisible();
});
Then("vê quais dados são guardados e para que servem", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "O que guardamos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Para quê" })).toBeVisible();
});
Then("vê que a IA do app só recebe dados com a autorização da família", async ({ page }) => {
  await expect(page.getByText(/ligar os recursos de IA/)).toBeVisible();
});
Then(
  "vê que o assistente do próprio membro envia dados ao provedor que ele usa",
  async ({ page }) => {
    await expect(page.getByText(/provedor que você usa/)).toBeVisible();
  },
);
Then("vê os prazos de retenção de sessões, convites e dados financeiros", async ({ page }) => {
  const t = page.getByTestId("tabela-retencao");
  await expect(t).toContainText("Sessões");
  await expect(t).toContainText("90 dias depois do encerramento");
  await expect(t).toContainText("enquanto a família existir");
});
Then("vê {string} e {string} com links para o Perfil", async ({ page }, a: string, b: string) => {
  await expect(page.getByRole("link", { name: a })).toHaveAttribute("href", "/perfil");
  await expect(page.getByRole("link", { name: b })).toHaveAttribute(
    "href",
    "/perfil/excluir-conta",
  );
});
Then("vê o contato {string}", async ({ page }, c: string) => {
  await expect(page.getByTestId("politica-contato")).toHaveText(c);
});
Then("vê o número da versão e a data da última atualização", async ({ page }) => {
  await expect(page.getByTestId("politica-versao")).toHaveText(
    /Versão 1 · atualizada em \d{2}\/\d{2}\/\d{4}/,
  );
});
Then("o texto é legível sem rolagem horizontal", async ({ page }) => {
  await expect(heading(page)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
