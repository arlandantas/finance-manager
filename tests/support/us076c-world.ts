import { vi } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeAccount, makeCard, makeFamily } from "../support/factories";
import { oauthDance, stubCimd, toolCall, useMcpEnv } from "../support/mcp-client";

// Mundo comum dos testes da US-076c: família, duas conexões (Lucas com confirmação, Mariana direta) e atalhos.
export { vi };
export const db = testDb();
export const T0 = Date.parse("2026-11-10T15:00:00Z");
export const MIN = 60_000;
export const at = <T>(offsetMs: number, fn: () => Promise<T>) =>
  withClock(new Date(T0 + offsetMs).toISOString(), fn);

export const w = {} as {
  fx: FamilyFixture;
  token: string;
  directToken: string;
  marianaCard: Awaited<ReturnType<typeof makeCard>>;
  nubank: Awaited<ReturnType<typeof makeCard>>;
  saude: string;
};
export const lucas = () =>
  w.fx.byName.Lucas?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
export const mariana = () =>
  w.fx.byName.Mariana?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
export const grantOf = (label: string) => db.mcpGrant.findFirstOrThrow({ where: { label } });

export async function propor(args: Record<string, unknown> = {}, offset = 0, bearer = w.token) {
  return at(offset, async () => {
    const r = await toolCall(bearer, "propor_lancamento", {
      description: "Farmácia",
      amountInCents: 8000,
      categoryId: w.saude,
      cardId: w.nubank.id,
      ...args,
    });
    const result = r.body?.result;
    return {
      sc: result?.isError ? undefined : result?.structuredContent,
      err: result?.isError
        ? (result.structuredContent?.error ?? { message: result.content?.[0]?.text })
        : undefined,
    };
  });
}
export const decide = (
  who: typeof lucas,
  id: string,
  action: "confirm" | "reject",
  offset = 0,
  key?: string,
) =>
  at(offset, () =>
    call(
      who(),
      "POST",
      `/api/v1/assistant/proposals/${id}/${action}`,
      {},
      key ? { idempotencyKey: key } : {},
    ),
  );
export const txCount = () => db.transaction.count({ where: { origin: "ASSISTANT" } });

export async function setupWorld() {
  await resetDb();
  useMcpEnv();
  stubCimd();
  w.fx = await makeFamily();
  await makeAccount(w.fx, { name: "Itaú Lucas", owner: "Lucas", openingBalanceInCents: 500000 });
  w.nubank = await makeCard(w.fx, {
    name: "Nubank Lucas",
    owner: "Lucas",
    limitInCents: 1_000_000,
  });
  w.saude = (
    await db.category.findFirstOrThrow({ where: { familyId: w.fx.family.id, name: "Saúde" } })
  ).id;
  const l = lucas();
  w.marianaCard = await makeCard(w.fx, {
    name: "Nubank Mariana",
    owner: "Mariana",
    limitInCents: 1_000_000,
  });
  w.token = (
    await at(0, () =>
      oauthDance({
        member: l,
        scopes: ["read", "write"],
        allowWrite: true,
        label: "Com confirmação",
      }),
    )
  ).accessToken;
  w.directToken = (
    await at(0, () =>
      oauthDance({
        member: mariana(),
        scopes: ["read", "write"],
        allowWrite: true,
        label: "Direto",
      }),
    )
  ).accessToken;
  await db.mcpGrant.update({
    where: { id: (await grantOf("Com confirmação")).id },
    data: { requireConfirmation: true },
  });
}
