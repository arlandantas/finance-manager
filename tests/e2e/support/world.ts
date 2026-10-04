import { makeAccount, makeFamily } from "../../support/factories";
import type { World } from "./fixtures";

/** Família com Mariana (ADMIN) e Lucas (MEMBER) e as categorias padrão; sem contas. */
export async function setupFamily(world: World, name = "Família Silva") {
  if (!world.family) world.family = await makeFamily({ name });
  return world.family;
}

/** Cria (uma vez por cenário) a conta de lançamentos "Nubank Conjunta" (R$ 5.000,00). */
export async function ensureAccount(world: World) {
  if (!world.data.account) {
    world.data.account = await makeAccount(await setupFamily(world), {
      name: "Nubank Conjunta",
      owner: "Mariana",
      openingBalanceInCents: 500000,
    });
  }
  return world.data.account as Awaited<ReturnType<typeof makeAccount>>;
}

/** Fixa o "hoje" do servidor E2E (ex.: "2026-10-15" => 12:00 em São Paulo). Restaurado no Before. */
export async function setToday(date: string) {
  const res = await fetch("http://localhost:3101/api/dev/clock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ now: `${date}T15:00:00Z` }),
  });
  if (!res.ok) throw new Error(`relógio de teste indisponível (${res.status})`);
}
