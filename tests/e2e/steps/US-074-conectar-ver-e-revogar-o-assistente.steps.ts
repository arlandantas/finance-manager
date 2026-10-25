import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { gotoReady } from "../../support/nav";
import { family } from "../support/acerto";
import {
  loginAsWho,
  openAssistant,
  seedAuthorizationRequest,
  seedGrant,
  type Who,
} from "../support/assistente";
import { Given, Then, When, type World } from "../support/fixtures";

Given("o acesso por assistente permitido pela família", async () => {
  // padrão do app: a família nasce permitindo o acesso por assistente
});

Given("que Lucas tem o assistente {string} conectado", async ({ world }, label: string) => {
  await seedGrant(world, "Lucas", { label });
});
Given(
  "que Lucas tem o assistente {string} conectado com consulta e lançamento até {word}",
  async ({ world }, label: string, ate: string) => {
    const [d, m, y] = ate.split("/");
    await seedGrant(world, "Lucas", { label, write: true, expiresAt: `${y}-${m}-${d}T15:00:00Z` });
  },
);
Given("que o Claude pediu acesso para consultar e lançar", async ({ world }) => {
  const r = await seedAuthorizationRequest(true);
  world.data.requestId = r.id;
  world.data.consentCookie = r.consentCookie;
});

// Abre "Configurações" ▸ "Assistente de IA" (US-074) ou "Assistente de IA" ▸ aba (US-077/076b).
async function openAssistantTab(
  { world, page }: { world: World; page: Page },
  who: Who,
  primeiro: string,
  segundo: string,
) {
  await loginAsWho(world, page, who);
  await gotoReady(page, "/familia");
  if (primeiro === "Configurações") {
    await page.getByTestId("assistant-settings-link").click();
    await expect(page.getByRole("heading", { name: segundo, level: 1 })).toBeVisible();
    return;
  }
  await openAssistant(world, page, who);
  await page.getByRole("tab", { name: segundo }).click();
}
When("{word} abre {string} e {string}", async ({ world, page }, who: Who, a: string, b: string) =>
  openAssistantTab({ world, page }, who, a, b),
);
Given(
  "que {word} abre {string} e {string}",
  async ({ world, page }, who: Who, a: string, b: string) =>
    openAssistantTab({ world, page }, who, a, b),
);

When("Lucas abre a tela de autorização do Claude", async ({ world, page }) => {
  await loginAsWho(world, page, "Lucas");
  // SEC-011: o consentimento só abre no navegador que iniciou o pedido (cookie com nonce)
  await page.context().addCookies([
    {
      name: "mcp_authz",
      value: world.data.consentCookie as string,
      url: "http://localhost:3101",
    },
  ]);
  await gotoReady(page, `/oauth/consent?request=${world.data.requestId as string}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("quer acessar seus dados");
});

When("toca em {string} nas configurações", async ({ page }, nome: string) => {
  await page.getByRole("button", { name: nome }).click();
});

Then("vê {string} no assistente", async ({ page }, texto: string) => {
  await expect(page.getByText(texto)).toBeVisible();
});

Then("vê a URL do servidor do app para colar no Claude", async ({ page }) => {
  await expect(page.getByTestId("mcp-url")).toHaveText("http://localhost:3101/api/mcp");
});
Then("não vê nenhuma senha, chave ou código para guardar", async ({ page }) => {
  const text = (await page.getByRole("dialog").innerText()).toLowerCase();
  for (const word of ["fma_", "fmr_", "senha:", "chave de acesso", "token:", "segredo"]) {
    expect(text).not.toContain(word);
  }
});
Then(
  "vê os passos para o Claude na web, no Desktop, no celular e no Claude Code",
  async ({ page }) => {
    const d = page.getByRole("dialog");
    await expect(d).toContainText("Claude (web, Desktop e celular)");
    await expect(d.getByText("Claude Code", { exact: true })).toBeVisible();
    await d.getByText("Claude Code", { exact: true }).click();
    await expect(d).toContainText("claude mcp add --transport http financas");
  },
);
Then("não vê passos para outros assistentes", async ({ page }) => {
  const text = await page.getByRole("dialog").innerText();
  for (const name of ["ChatGPT", "Gemini", "OpenAI"]) expect(text).not.toContain(name);
});

Then("vê o aviso de autorização {string}", async ({ page }, texto: string) => {
  await expect(page.getByText(texto)).toBeVisible();
});
Then("o botão de autorização {string} está desabilitado", async ({ page }, nome: string) => {
  await expect(page.getByRole("button", { name: nome, exact: true })).toBeDisabled();
});
Then("o botão de autorização {string} está habilitado", async ({ page }, nome: string) => {
  await expect(page.getByRole("button", { name: nome, exact: true })).toBeEnabled();
});
When("Lucas marca {string}", async ({ page }, rotulo: string) => {
  await page.getByRole("checkbox", { name: rotulo, exact: rotulo === "Entendi" }).check();
});
Then("a opção {string} aparece desmarcada", async ({ page }, rotulo: string) => {
  await expect(page.getByRole("checkbox", { name: rotulo })).not.toBeChecked();
});

Then("vê a conexão {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("connection").getByText(texto, { exact: true })).toBeVisible();
});

When(
  "toca em {string} na conexão {string} e confirma",
  async ({ page }, acao: string, label: string) => {
    await page
      .getByTestId("connection")
      .filter({ hasText: label })
      .getByRole("button", { name: acao })
      .click();
    await page.getByRole("dialog").getByRole("button", { name: acao, exact: true }).click();
  },
);
Then(
  "a conexão {string} aparece como {string}",
  async ({ page }, label: string, status: string) => {
    await expect(
      page.getByTestId("connection").filter({ hasText: label }).getByTestId("connection-status"),
    ).toContainText(status);
  },
);

Then("o assistente {string} de Lucas deixa de funcionar", async ({ world }, label: string) => {
  const g = await testDb().mcpGrant.findFirstOrThrow({
    where: { familyId: family(world).family.id, label },
  });
  expect(g.status).toBe("REVOKED");
  expect(await testDb().mcpToken.count({ where: { grantId: g.id } })).toBe(0);
});

Then("não vê o assistente {string} na lista", async ({ page }, label: string) => {
  await expect(page.getByTestId("no-connections")).toBeVisible();
  await expect(page.getByTestId("connection").filter({ hasText: label })).toHaveCount(0);
});

When("Mariana desliga {string} e confirma", async ({ world, page }, nome: string) => {
  await openAssistant(world, page, "Mariana");
  await page.getByRole("switch", { name: nome }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Desligar" }).click();
  await expect(page.getByRole("switch", { name: nome })).toHaveAttribute("aria-checked", "false");
});

Then("vê o aviso de bloqueio {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("blocked-notice")).toHaveText(texto);
});
Then("não vê a chave {string} editável", async ({ page }, nome: string) => {
  await expect(page.getByRole("switch", { name: nome })).toHaveCount(0);
  await expect(page.getByTestId("family-switch")).toContainText("Permitido pela família");
});

Given("que um aplicativo desconhecido pediu acesso", async ({ world }) => {
  const r = await seedAuthorizationRequest(false, { unknown: true });
  world.data.requestId = r.id;
  world.data.consentCookie = r.consentCookie;
});

When("Lucas abre o endereço da autorização em outro navegador", async ({ world, browser }) => {
  // outro navegador/aparelho: contexto novo, SEM o cookie do pedido (SEC-011)
  const ctx = await browser.newContext({ baseURL: "http://localhost:3101" });
  const other = await ctx.newPage();
  const { loginAs } = await import("../../support/login");
  await loginAs(other, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  await gotoReady(other, `/oauth/consent?request=${world.data.requestId as string}`);
  world.data.otherPage = other;
});

Then("não há botões para permitir ou negar", async ({ world }) => {
  const other = world.data.otherPage as Page;
  await expect(other.getByRole("button", { name: "Permitir" })).toHaveCount(0);
  await expect(other.getByRole("button", { name: "Cancelar" })).toHaveCount(0);
  const row = await testDb().mcpAuthorizationRequest.findUniqueOrThrow({
    where: { id: world.data.requestId as string },
  });
  expect(row.userId).toBeNull(); // o pedido não foi vinculado a quem abriu o endereço
});

Then(
  "vê o selo {string} e a URL de retorno {string}",
  async ({ page }, selo: string, url: string) => {
    await expect(page.getByTestId("verified-badge")).toContainText(selo);
    await expect(page.getByTestId("redirect-url")).toContainText(
      url.replace("https://", "https://"),
    );
  },
);

When("Lucas abre o início do app", async ({ world, page }) => {
  await loginAsWho(world, page, "Lucas");
  await gotoReady(page, "/");
});

Then(
  "vê o cartão de nova conexão {string} com a ação {string}",
  async ({ page }, label: string, acao: string) => {
    const card = page.getByTestId("new-connection");
    await expect(card).toContainText(`Nova conexão: ${label}`);
    await expect(card.getByRole("button", { name: acao })).toBeVisible();
  },
);

When("Lucas dispensa o aviso de nova conexão", async ({ page }) => {
  await page.getByTestId("new-connection").getByRole("button", { name: "Fui eu" }).click();
});

Then("o cartão de nova conexão não aparece mais", async ({ page }) => {
  await expect(page.getByTestId("new-connection")).toHaveCount(0);
});

Then("o outro navegador vê {string}", async ({ world }, texto: string) => {
  await expect((world.data.otherPage as Page).getByText(texto)).toBeVisible();
});
