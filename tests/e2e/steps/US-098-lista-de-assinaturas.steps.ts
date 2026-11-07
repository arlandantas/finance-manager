import { expect, type Page, test } from "@playwright/test";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { makeFamily } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { enterAs } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();
const SHOTS =
  "/tmp/claude-1000/-home-arlan-ai-tests-finance-manager/5f1caabc-bd63-4581-86ca-b9d16318acfb/scratchpad";
const rows = (page: Page) => page.getByTestId("subscription-row");
const rowOf = (page: Page, nome: string) =>
  rows(page).filter({ has: page.getByText(nome, { exact: true }) });
const total = (page: Page) => page.getByTestId("subscriptions-total");

async function seed(
  familyId: string,
  nome: string,
  cents: number,
  payerName: string,
  cardName: string,
) {
  const [member, card, cat] = await Promise.all([
    db.member.findFirstOrThrow({ where: { familyId, user: { name: { startsWith: payerName } } } }),
    db.creditCard.findFirstOrThrow({ where: { familyId, name: cardName } }),
    db.category.findFirstOrThrow({ where: { familyId, kind: "EXPENSE" } }),
  ]);
  const sub = await db.cardSubscription.create({
    data: {
      familyId,
      cardId: card.id,
      description: nome,
      categoryId: cat.id,
      payerMemberId: member.id,
      authorMemberId: member.id,
      dayOfMonth: 10,
      firstChargeOn: new Date("2026-11-10T00:00:00Z"),
      nextChargeOn: new Date("2026-11-10T00:00:00Z"),
    },
  });
  await db.cardSubscriptionAmount.create({
    data: {
      familyId,
      subscriptionId: sub.id,
      fromMonth: new Date("2026-11-01T00:00:00Z"),
      amountInCents: BigInt(cents),
      authorMemberId: member.id,
    },
  });
}
const toCents = (v: string) => Number(v.replace(/\D/g, ""));

type Sub = [nome: string, valor: string, payer: string, card: string];
Given(
  /^a família tem as assinaturas ativas "([^"]+)" de "([^"]+)" \((\w+), ([^)]+)\), "([^"]+)" de "([^"]+)" \((\w+), ([^)]+)\) e "([^"]+)" de "([^"]+)" \((\w+), ([^)]+)\)$/,
  async (
    { world },
    n1: string,
    v1: string,
    p1: string,
    c1: string,
    n2: string,
    v2: string,
    p2: string,
    c2: string,
    n3: string,
    v3: string,
    p3: string,
    c3: string,
  ) => {
    const familyId = world.family?.family.id as string;
    const subs: Sub[] = [
      [n1, v1, p1, c1],
      [n2, v2, p2, c2],
      [n3, v3, p3, c3],
    ];
    for (const [nome, valor, payer, card] of subs) {
      await seed(familyId, nome, toCents(valor), payer, card);
    }
  },
);

Given(
  "outra família tem a assinatura {string} de {string}",
  async ({}, nome: string, valor: string) => {
    const other = await makeFamily({
      name: "Família Souza",
      uniqueEmails: true,
      members: [{ email: "carla@exemplo.com", name: "Carla Souza", role: "ADMIN" }],
    });
    await db.creditCard.create({
      data: {
        familyId: other.family.id,
        name: "Cartão Souza",
        institution: "Outro",
        ownerMemberId: other.members[0]?.memberId as string,
        limitInCents: 100000n,
        closingDay: 25,
        dueDay: 5,
        updatedByMemberId: other.members[0]?.memberId as string,
      },
    });
    await seed(other.family.id, nome, toCents(valor), "Carla", "Cartão Souza");
  },
);

Given(/^a assinatura "([^"]+)" foi encerrada em 04\/11\/2026$/, async ({ world }, nome: string) => {
  const familyId = world.family?.family.id as string;
  const sub = await db.cardSubscription.findFirstOrThrow({
    where: { familyId, description: nome },
  });
  await db.cardSubscription.update({
    where: { id: sub.id },
    data: {
      endedByMemberId: sub.authorMemberId,
      endedAt: new Date("2026-11-04T15:00:00Z"),
      endedOn: new Date("2026-11-04T00:00:00Z"),
      nextChargeOn: null,
    },
  });
});

Given("a família não tem assinaturas", async ({ world }) => {
  const familyId = world.family?.family.id as string;
  await db.cardSubscriptionAmount.deleteMany({ where: { familyId } });
  await db.cardSubscription.deleteMany({ where: { familyId } });
});

async function watchConsole(page: Page, world: World) {
  if (world.data.consoleErrors) return;
  const errors: string[] = [];
  world.data.consoleErrors = errors;
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
}

When("Lucas abre a lista de assinaturas", async ({ page, world }) => {
  await watchConsole(page, world);
  await enterAs(world, page, "Lucas");
  await gotoReady(page, "/assinaturas");
  await expect(page.getByRole("heading", { name: "Assinaturas" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Ativas" })).toBeVisible();
  await expect(page.getByLabel("Carregando assinaturas")).toHaveCount(0);
});

Then("o total por mês é {string}", async ({ page }, valor: string) => {
  await expect(total(page)).toHaveText(normalizeSpaces(valor));
});

Then("a lista tem as assinaturas {string}", async ({ page }, a: string) => {
  await expect(rows(page)).toHaveCount(1);
  await expect(rowOf(page, a)).toHaveCount(1);
});
Then("a lista tem as assinaturas {string} e {string}", async ({ page }, a: string, b: string) => {
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText(a);
  await expect(rows(page).nth(1)).toContainText(b);
});
Then(
  "a lista tem as assinaturas {string}, {string} e {string}",
  async ({ page }, a: string, b: string, c: string) => {
    await expect(rows(page)).toHaveCount(3);
    for (const [i, n] of [a, b, c].entries()) await expect(rows(page).nth(i)).toContainText(n);
  },
);

Then(
  "o cartão {string} soma {string} e o cartão {string} soma {string}",
  async ({ page }, c1: string, v1: string, c2: string, v2: string) => {
    const by = page.getByTestId("subscriptions-by-card");
    await expect(by.filter({ hasText: c1 })).toContainText(normalizeSpaces(v1));
    await expect(by.filter({ hasText: c2 })).toContainText(normalizeSpaces(v2));
  },
);

Then("a lista de assinaturas não mostra {string}", async ({ page }, nome: string) => {
  await expect(page.locator("main")).not.toContainText(nome);
});

When("Lucas filtra por quem gastou {string}", async ({ page }, nome: string) => {
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await page
    .getByRole("group", { name: "Quem gastou" })
    .getByRole("button", { name: nome })
    .click();
  await expect(page.getByRole("button", { name: "Filtros (1)" })).toBeVisible();
});

Then("a assinatura {string} não tem ação de editar", async ({ page }, nome: string) => {
  await expect(rowOf(page, nome)).toHaveCount(1);
  await expect(rowOf(page, nome).getByTestId("subscription-open")).toHaveCount(0);
});
Then("a assinatura {string} tem ação de editar", async ({ page }, nome: string) => {
  await expect(rowOf(page, nome).getByTestId("subscription-open")).toHaveCount(1);
});

When("Lucas abre a aba {string}", async ({ page }, aba: string) => {
  await page.getByRole("tab", { name: aba }).click();
  await expect(page.getByRole("tab", { name: aba })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Carregando assinaturas")).toHaveCount(0);
});

Then(
  "a assinatura {string} mostra {string} sem ação de editar",
  async ({ page }, nome: string, texto: string) => {
    await expect(rowOf(page, nome)).toContainText(texto);
    await expect(rowOf(page, nome).getByTestId("subscription-open")).toHaveCount(0);
  },
);

Then("a lista de assinaturas mostra {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("subscriptions-empty")).toContainText(texto);
});

When("Lucas oculta os valores", async ({ page }) => {
  await page.getByTestId("hide-values-toggle").click();
  await expect(page.getByTestId("hide-values-toggle")).toHaveAttribute("aria-pressed", "true");
});

Then("nenhuma linha da lista mostra valor", async ({ page }) => {
  await expect(rows(page).first()).toContainText("R$ •••••");
  await expect(page.locator("main")).not.toContainText(/R\$\s?\d/);
});

Then("a lista não tem rolagem horizontal e não há erros no console", async ({ page, world }) => {
  await expect(rows(page)).toHaveCount(3);
  await page.screenshot({ path: `${SHOTS}/us098-${test.info().project.name}.png`, fullPage: true });
  expect(world.data.consoleErrors).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
