import { test as base, createBdd } from "playwright-bdd";
import type { FamilyFixture } from "../../support/factories";

/** Estado compartilhado entre os passos de um cenário. */
export type World = {
  family?: FamilyFixture;
  data: Record<string, unknown>;
};

export const test = base.extend<{ world: World }>({
  world: async ({}, use) => {
    await use({ data: {} });
  },
});

export const { Given, When, Then, Before, After } = createBdd(test);
