import { expect } from "@playwright/test";
import { testDb } from "../../support/db";
import { Then } from "../support/fixtures";

const db = testDb();

// Campo (input ou select) com o valor/opção exibida esperada.
Then(
  "o campo {string} vem preenchido com {string}",
  async ({ page }, campo: string, valor: string) => {
    const field = page.getByLabel(campo, { exact: true });
    const tag = await field.evaluate((el) => el.tagName);
    if (tag === "SELECT") {
      await expect(field.locator("option:checked")).toHaveText(valor);
    } else {
      await expect(field).toHaveValue(valor);
    }
  },
);

// "Nenhuma conta é criada": conta de usuário (login, US-001) ou conta bancária (US-004).
Then("nenhuma conta é criada", async ({ world }) => {
  if (world.family) {
    expect(await db.bankAccount.count()).toBe(0);
  } else {
    expect(await db.user.count()).toBe(0);
    expect(await db.session.count()).toBe(0);
  }
});
