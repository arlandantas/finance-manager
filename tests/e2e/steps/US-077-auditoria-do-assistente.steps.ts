import { expect } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import { makeTransaction } from "../../support/factories";
import { accountsOf, family } from "../support/acerto";
import { seedAuditEvent, seedGrant } from "../support/assistente";
import { Given, Then, When } from "../support/fixtures";

// O relógio do E2E é fixo em 04/10/2026 15:00Z (playwright.config.ts).
const THIS_WEEK = (d: number) => `2026-10-0${d}T12:00:00Z`;

Given(
  "o assistente {string} de Lucas com 3 consultas e 1 lançamento nesta semana",
  async ({ world }, label: string) => {
    const g = await seedGrant(world, "Lucas", { label, write: true });
    world.data.grantId = g.id;
    await seedAuditEvent(world, "Lucas", {
      grantId: g.id,
      tool: "consultar_saldos",
      at: THIS_WEEK(1),
    });
    await seedAuditEvent(world, "Lucas", {
      grantId: g.id,
      tool: "gastos_por_categoria",
      params: { period: "2026-10" },
      at: THIS_WEEK(2),
    });
    await seedAuditEvent(world, "Lucas", {
      grantId: g.id,
      tool: "listar_lancamentos",
      params: { period: "2026-10", limit: 20, page: 1 },
      at: THIS_WEEK(2),
    });
    const t = await makeTransaction(family(world), {
      account: accountsOf(world).itau,
      category: "Saúde",
      amountInCents: 8000,
      occurredOn: "2026-10-03",
      author: "Lucas",
      payer: "Lucas",
      shared: false,
      description: "Farmácia",
    });
    world.data.transactionId = t.id;
    await seedAuditEvent(world, "Lucas", {
      grantId: g.id,
      tool: "lancar_despesa",
      transactionId: t.id,
      at: THIS_WEEK(3),
    });
  },
);

Given(
  "que Lucas excluiu o lançamento {string} de {string}",
  async ({ world }, _d: string, _v: string) => {
    await testDb().transaction.update({
      where: { id: world.data.transactionId as string },
      data: {
        deletedAt: new Date("2026-10-04T14:00:00Z"),
        deletedByMemberId: family(world).byName.Lucas?.memberId as string,
        deletionReason: "DELETED",
      },
    });
  },
);

Given(
  "que o assistente de Lucas teve um lançamento de {string} bloqueado pelo limite",
  async ({ world }, _valor: string) => {
    await seedAuditEvent(world, "Lucas", {
      grantId: world.data.grantId as string,
      tool: "lancar_despesa",
      outcome: "LIMIT_EXCEEDED",
      at: THIS_WEEK(3),
    });
  },
);

Given(
  "que Lucas mudou o limite por lançamento de {string} para {string}",
  async ({ world }, de: string, _para: string) => {
    await seedAuditEvent(world, "Lucas", {
      grantId: null,
      kind: "LIMITS_CHANGED",
      params: { field: "maxAmountPerTxCents", from: parseBRL(de) ?? 0, to: "none" },
      at: THIS_WEEK(3),
    });
  },
);

Given(
  "que existe outro assistente {string} de Lucas com 1 consulta nesta semana e 1 consulta antiga",
  async ({ world }, label: string) => {
    const g = await seedGrant(world, "Lucas", { label });
    await seedAuditEvent(world, "Lucas", {
      grantId: g.id,
      tool: "consultar_saldos",
      at: THIS_WEEK(3),
    });
    await seedAuditEvent(world, "Lucas", {
      grantId: g.id,
      tool: "consultar_saldos",
      at: "2026-08-01T12:00:00Z",
    });
  },
);

Then(
  "vê {int} registros de atividade com data, ferramenta e resultado",
  async ({ page }, n: number) => {
    const items = page.getByTestId("activity-item");
    await expect(items).toHaveCount(n);
    for (const it of await items.all()) {
      await expect(it.getByTestId("activity-outcome")).not.toBeEmpty();
      await expect(it).toContainText(/\d{2}:\d{2}/);
    }
    await expect(page.getByRole("heading", { level: 3 }).first()).toContainText(
      /\d{2}\/\d{2}\/\d{4}/,
    );
  },
);

Then(
  "o registro {string} mostra o período {string}",
  async ({ page }, tool: string, periodo: string) => {
    await expect(page.getByTestId("activity-item").filter({ hasText: tool })).toContainText(
      periodo,
    );
  },
);

Then("nenhum registro de consulta mostra valores devolvidos", async ({ page }) => {
  const items = page.getByTestId("activity-item").filter({ hasText: "Consultou" });
  for (const it of await items.all()) {
    expect(await it.innerText()).not.toMatch(/R\$\s?\d/);
  }
});

Then(
  "vê o registro de atividade {string} com o link {string}",
  async ({ page }, texto: string, link: string) => {
    const it = page.getByTestId("activity-item").filter({ hasText: texto });
    await expect(it).toHaveCount(1);
    await expect(it.getByRole("link", { name: link })).toBeVisible();
  },
);
Then(
  "vê o registro de atividade {string} sem o link {string}",
  async ({ page }, texto: string, link: string) => {
    const it = page.getByTestId("activity-item").filter({ hasText: texto });
    await expect(it).toHaveCount(1);
    await expect(it.getByRole("link", { name: link })).toHaveCount(0);
  },
);
Then("vê o registro de atividade {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("activity-item").filter({ hasText: texto })).toHaveCount(1);
});

Then("vê um único registro do lançamento {string}", async ({ page }, desc: string) => {
  await expect(page.getByTestId("activity-item").filter({ hasText: desc })).toHaveCount(1);
});
Then("não vê registros de proposta ou de confirmação", async ({ page }) => {
  await expect(
    page.getByTestId("activity-item").filter({ hasText: /Propôs|Confirmou|proposta/ }),
  ).toHaveCount(0);
});

Then("vê o resultado {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("activity-outcome").filter({ hasText: texto })).toHaveCount(1);
});

When(
  "Lucas filtra a atividade por {string} e {string}",
  async ({ page }, assistente: string, periodo: string) => {
    await page.getByRole("combobox", { name: "Assistente" }).selectOption({ label: assistente });
    await page.getByRole("combobox", { name: "Período" }).selectOption({ label: periodo });
  },
);
Then("vê só {int} registros do assistente {string}", async ({ page }, n: number, label: string) => {
  const items = page.getByTestId("activity-item");
  await expect(items).toHaveCount(n);
  for (const it of await items.all()) await expect(it).toContainText(label);
  await expect(
    page.getByTestId("activity-item").filter({ hasText: "Claude do trabalho" }),
  ).toHaveCount(0);
});

Then("não vê registros de atividade de Lucas", async ({ page }) => {
  await expect(page.getByTestId("activity-empty")).toHaveText("Nenhuma atividade no período");
  await expect(page.getByTestId("activity-item")).toHaveCount(0);
});

When("toca em {string} na atividade e confirma", async ({ page }, acao: string) => {
  await page.getByRole("button", { name: acao }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Revogar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
