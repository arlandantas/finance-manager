import { expect } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces, TODAY, TOMORROW, YESTERDAY } from "../../support/constants";
import { testDb } from "../../support/db";
import { makeAccount, makeFamily } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When } from "../support/fixtures";
import {
  balanceOnScreen,
  drawer,
  fillAmount,
  lastTransaction,
  openDrawer,
  pickCategory,
  save,
  setDate,
  waitSaved,
} from "../support/lancamento";
import { doubleClickPay } from "../support/previstas";

const db = testDb();

Given(
  /^a "([^"]+)" com a conta "([^"]+)" \(saldo (.+)\)$/,
  async ({ world }, familia: string, conta: string, saldo: string) => {
    world.family = await makeFamily({ name: familia });
    await makeAccount(world.family, {
      name: conta,
      owner: "Mariana",
      openingBalanceInCents: parseBRL(saldo) ?? 0,
    });
  },
);

Given("os membros {string} e {string}", async ({}, _a: string, _b: string) => {});

Given("Lucas está autenticado", async ({ page, world }) => {
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  world.data.loggedAs = "Lucas";
  await gotoReady(page, "/");
});

When(
  "Lucas toca no botão {string}, digita {string}, escolhe a categoria {string} e toca em {string}",
  async ({ page }, _botao: string, valor: string, categoria: string, salvar: string) => {
    await openDrawer(page);
    await fillAmount(page, valor);
    await pickCategory(page, categoria);
    await save(page, salvar);
    await waitSaved(page);
  },
);

Then(
  "a despesa é registrada com autor {string}, quem pagou {string}, conta {string} e data de hoje",
  async ({}, autor: string, pagador: string, conta: string) => {
    const { row, name } = await lastTransaction("EXPENSE");
    expect(name(row.authorMemberId)).toBe(autor);
    expect(name(row.payerMemberId)).toBe(pagador);
    expect(row.account?.name).toBe(conta);
    expect(row.occurredOn.toISOString().slice(0, 10)).toBe(TODAY);
  },
);

Then("está marcada como {string}", async ({}, rotulo: string) => {
  // US-030: o lançamento rápido nasce "Só meu"
  expect((await lastTransaction("EXPENSE")).row.isSharedExpense).toBe(rotulo !== "Só meu");
});

Then(
  "o saldo de {string} passa a {string}",
  async ({ page, world }, conta: string, saldo: string) => {
    expect(await balanceOnScreen(page, conta)).toContain(normalizeSpaces(saldo));
  },
);

Then("aparece o aviso {string}", async ({ page }, aviso: string) => {
  await expect(page.getByText(aviso, { exact: true })).toBeVisible();
});

Given(
  "que Mariana pagou o supermercado de {word} {word}",
  async ({}, _a: string, _b: string) => {},
);

When(
  "Lucas lança {string} em {string} e escolhe {string}",
  async ({ page }, valor: string, categoria: string, escolha: string) => {
    await openDrawer(page);
    await fillAmount(page, valor);
    await pickCategory(page, categoria);
    await page.getByRole("radio", { name: escolha.split(": ")[1] as string, exact: true }).click();
    await save(page, "Salvar Despesa");
    await waitSaved(page);
  },
);

Then("o autor é {string} e quem pagou é {string}", async ({}, autor: string, pagador: string) => {
  const { row, name } = await lastTransaction("EXPENSE");
  expect(name(row.authorMemberId)).toBe(autor);
  expect(name(row.payerMemberId)).toBe(pagador);
});

When(
  "Lucas lança {string} em {string} com {string} desligado",
  async ({ page }, valor: string, categoria: string, rotulo: string) => {
    await openDrawer(page);
    await fillAmount(page, valor);
    await pickCategory(page, categoria);
    const sw = page.getByRole("switch", { name: rotulo });
    await expect(sw).not.toBeChecked(); // padrão "Só meu" (US-030)
    await save(page, "Salvar Despesa");
    await waitSaved(page);
  },
);

Then("a despesa é registrada como pessoal", async () => {
  expect((await lastTransaction("EXPENSE")).row.isSharedExpense).toBe(false);
});

Then("não entra no acerto de contas", async () => {
  // Base do acerto (SDD-002): soma das despesas comuns do período. Pessoal não conta.
  const shared = await db.transaction.count({
    where: { kind: "EXPENSE", isSharedExpense: true, deletedAt: null },
  });
  expect(shared).toBe(0);
});

When("Lucas tenta salvar com valor {string}", async ({ page }, valor: string) => {
  await openDrawer(page);
  await fillAmount(page, valor);
  await pickCategory(page, "Supermercado");
  await save(page, "Salvar Despesa");
});

Then("vê {string}", async ({ page }, texto: string) => {
  await expect(page.getByText(texto, { exact: true })).toBeVisible();
});

Then("nada é registrado", async ({ world }) => {
  // `baselineTx`: lançamentos que o contexto do cenário já criou (ex.: compra da fatura, US-017b).
  const baseline = (world.data.baselineTx as number | undefined) ?? 0;
  expect(await db.transaction.count({ where: { kind: { in: ["EXPENSE", "INCOME"] } } })).toBe(
    baseline,
  );
});

When("Lucas informa o valor mas não escolhe categoria e tenta salvar", async ({ page }) => {
  await openDrawer(page);
  await fillAmount(page, "R$ 10,00");
  await save(page, "Salvar Despesa");
});

Then("o campo categoria é destacado com {string}", async ({ page }, mensagem: string) => {
  await expect(page.getByRole("radiogroup", { name: "Categoria" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(drawer(page).getByText(mensagem, { exact: true })).toBeVisible();
});

When(
  "Lucas salva {string} na categoria {string} sem descrição",
  async ({ page }, valor: string, categoria: string) => {
    await openDrawer(page);
    await fillAmount(page, valor);
    await pickCategory(page, categoria);
    await save(page, "Salvar Despesa");
    await waitSaved(page);
  },
);

Then("a despesa é registrada com a descrição {string}", async ({}, descricao: string) => {
  expect((await lastTransaction("EXPENSE")).row.description).toBe(descricao);
});

When("Lucas toca duas vezes rapidamente em {string}", async ({ page, world }, botao: string) => {
  if (botao === "Confirmar pagamento") return doubleClickPay(page, botao, world); // US-019/US-017b
  await openDrawer(page);
  await fillAmount(page, "R$ 50,00");
  await pickCategory(page, "Supermercado");
  await drawer(page).getByRole("button", { name: botao }).dblclick();
  await waitSaved(page);
});

Then("apenas uma despesa é registrada", async () => {
  expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(1);
});

Then("o saldo da conta é reduzido uma única vez", async ({ page, world }) => {
  expect(await balanceOnScreen(page, "Nubank Conjunta")).toContain("R$ 950,00");
});

When("Lucas abre {string} e escolhe a data de ontem", async ({ page }, _detalhes: string) => {
  await openDrawer(page);
  await fillAmount(page, "R$ 10,00");
  await pickCategory(page, "Supermercado");
  await setDate(page, YESTERDAY);
  await save(page, "Salvar Despesa");
  await waitSaved(page);
});

Then("a despesa é registrada com a data de ontem", async () => {
  expect((await lastTransaction("EXPENSE")).row.occurredOn.toISOString().slice(0, 10)).toBe(
    YESTERDAY,
  );
});

When("Lucas escolhe uma data posterior a hoje", async ({ page }) => {
  await openDrawer(page);
  await fillAmount(page, "R$ 10,00");
  await pickCategory(page, "Supermercado");
  await setDate(page, TOMORROW);
  await save(page, "Salvar Despesa");
});

Given("que não há conexão", async ({ page }) => {
  // Toda mutação da API falha; leituras continuam funcionando (reutilizado pelos cenários da R2).
  await page.route("**/api/v1/**", (route) =>
    ["POST", "PATCH"].includes(route.request().method())
      ? route.abort("connectionfailed")
      : route.continue(),
  );
});

When("Lucas toca em {string}", async ({ page, world }, rotulo: string) => {
  if (rotulo === "+") {
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    return;
  }
  await openDrawer(page);
  await fillAmount(page, "R$ 50,00");
  await pickCategory(page, "Supermercado");
  await save(page, rotulo);
  // Passo comum "o formulário preserva o que foi digitado" (common.steps.ts) chama este verificador.
  world.data.formCheck = async () => {
    await expect(page.getByLabel("Valor", { exact: true })).toHaveValue(/R\$\s50,00/);
    await expect(page.getByRole("radio", { name: "Supermercado", exact: true })).toBeChecked();
    // Reenvio (mesma Idempotency-Key) cria uma única despesa quando a rede volta.
    await page.unroute("**/api/v1/**");
    await save(page, rotulo);
    await waitSaved(page);
    expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(1);
  };
});

Given("que a família não tem contas", async ({ page, world }) => {
  // Outra família (sem contas) com um "Lucas": evita TRUNCATE no meio do cenário (o app tem requisições em curso).
  world.family = await makeFamily({
    name: "Família Sem Contas",
    members: [{ email: "lucas.semcontas@exemplo.com", name: "Lucas Silva", role: "ADMIN" }],
  });
  await loginAs(page, { email: "lucas.semcontas@exemplo.com", name: "Lucas Silva" });
  await gotoReady(page, "/");
});

Then(
  "é orientado a {string} com atalho para a tela de contas",
  async ({ page }, mensagem: string) => {
    await expect(page.getByRole("dialog", { name: mensagem })).toBeVisible();
    await expect(page.getByLabel("Valor", { exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Ir para Contas" }).click();
    await expect(page).toHaveURL(/\/contas$/);
  },
);

When("Lucas executa o fluxo valor, categoria e salvar com os padrões", async ({ page, world }) => {
  let interactions = 0;
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  await expect(page.getByLabel("Valor", { exact: true })).toBeFocused();
  // padrões: conta já escolhida, quem pagou = logado, dividir ligado
  await expect(page.getByLabel("Pagar com", { exact: true })).toHaveValue(/.+/);
  await fillAmount(page, "R$ 25,00");
  interactions += 1;
  await pickCategory(page, "Transporte");
  interactions += 1;
  await save(page, "Salvar Despesa");
  interactions += 1;
  await waitSaved(page);
  world.data.interactions = interactions;
});

Then(
  "o fluxo exige no máximo {int} interações \\(valor, categoria, salvar e, opcionalmente, conta)",
  async ({ world }, max: number) => {
    expect(world.data.interactions as number).toBeLessThanOrEqual(max);
  },
);
