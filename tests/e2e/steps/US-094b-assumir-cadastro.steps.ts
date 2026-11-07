import { expect } from "@playwright/test";
import { testDb } from "../../support/db";
import {
  makeAccount,
  makeFamily,
  makeInvitation,
  makeTransaction,
  makeUnlinkedMember,
} from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When } from "../support/fixtures";

const db = testDb();

Given(
  "a família {string} com o cadastro sem acesso {string} com 1 conta e 1 lançamento",
  async ({ world }, familia: string, nome: string) => {
    const fx = await makeFamily({
      name: familia,
      members: [{ email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" }],
    });
    world.family = fx;
    const m = await makeUnlinkedMember(fx, {
      name: nome,
      pendingEmail: "ana@exemplo.com",
      register: true,
    });
    world.data.memberId = m.memberId;
    const acc = await makeAccount(fx, { name: "Poupança", owner: nome.split(" ")[0] as string });
    await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 1000,
      occurredOn: "2026-10-01",
      payer: nome.split(" ")[0] as string,
    });
  },
);

Given("existe um convite vinculado para {string}", async ({ world }, email: string) => {
  const inv = await makeInvitation(world.family as never, { email, createdAt: new Date() });
  await db.invitation.update({
    where: { id: inv.id },
    data: { memberId: world.data.memberId as string },
  });
});

Given(
  "a convidada entrou com o Google como {string} e vê o convite",
  async ({ page }, nome: string) => {
    await loginAs(page, { email: "ana@exemplo.com", name: nome });
    await gotoReady(page, "/");
    await expect(page).toHaveURL(/\/convites$/);
    await expect(page.getByTestId("linked-preview")).toBeVisible();
  },
);

Then("o resumo do convite diz {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("linked-preview")).toHaveText(texto);
});

When(
  "ela troca o nome para {string} e aciona {string}",
  async ({ page }, nome: string, botao: string) => {
    await page.getByLabel("Seu nome na família").fill(nome);
    const done = page.waitForResponse((r) => /\/me\/invitations\/.+\/accept$/.test(r.url()));
    await page.getByRole("button", { name: botao, exact: true }).click();
    await done;
  },
);

Then(
  "o cadastro {string} passa a ser da convidada com o nome {string}",
  async ({ page, world }, _rotulo: string, nome: string) => {
    await expect(page).toHaveURL(/joined=1/);
    const user = await db.user.findUniqueOrThrow({ where: { email: "ana@exemplo.com" } });
    const m = await db.member.findUniqueOrThrow({ where: { id: world.data.memberId as string } });
    expect(m).toMatchObject({ userId: user.id, name: nome, pendingEmail: null });
  },
);
Then("o lançamento e a conta seguem com o mesmo cadastro", async ({ world }) => {
  const id = world.data.memberId as string;
  expect(await db.transaction.count({ where: { payerMemberId: id, kind: "EXPENSE" } })).toBe(1);
  expect(await db.bankAccount.count({ where: { ownerMemberId: id } })).toBe(1);
});

Then("vê o erro de nome {string}", async ({ page }, msg: string) => {
  await expect(page.locator("[id^='linked-name-'][id$='-error']")).toHaveText(msg);
});
Then("o convite continua pendente", async () => {
  expect((await db.invitation.findFirstOrThrow()).status).toBe("PENDING");
});
