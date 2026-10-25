import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { InMemoryMailer, setMailer } from "@/lib/mail";
import { call } from "../support/call";
import { resetDb } from "../support/db";
import { asUser } from "../support/factories";

// SEC-040 (reteste final 2026-10-25, D-GES-48): o limite de convites vale também por PESSOA que convida
// (somando famílias criadas e excluídas) e o reenvio com e-mail conta.
const NOW = "2026-11-05T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let n = 0;

beforeEach(async () => {
  await resetDb();
  setMailer(new InMemoryMailer());
});

const invite = (as: Awaited<ReturnType<typeof asUser>>) =>
  at(() =>
    call(as, "POST", "/api/v1/invitations", { email: `alvo${++n}@exemplo.com`, role: "MEMBER" }),
  );
const newFamily = async (as: Awaited<ReturnType<typeof asUser>>, name: string) => {
  const r = await at(() => call(as, "POST", "/api/v1/families", { name }));
  expect(r.status, JSON.stringify(r.body)).toBe(201);
};
const dropFamily = async (as: Awaited<ReturnType<typeof asUser>>, name: string) => {
  const r = await at(() =>
    call(
      as,
      "POST",
      "/api/v1/family/delete",
      { confirmFamilyName: name },
      { idempotencyKey: randomUUID() },
    ),
  );
  expect(r.status, JSON.stringify(r.body)).toBe(200);
};

describe("SEC-040 teto de convites por pessoa", () => {
  it("reprodução do relatório: criar, convidar, excluir a família e recriar não zera o limite", async () => {
    const as = await asUser("convidante@exemplo.com", { name: "Convidante" });
    await newFamily(as, "Casa 1");
    for (let i = 0; i < 3; i++) expect((await invite(as)).status).toBe(201);
    await dropFamily(as, "Casa 1");
    await newFamily(as, "Casa 2");
    for (let i = 0; i < 2; i++) expect((await invite(as)).status).toBe(201); // 3 + 2 = 5 (limite por hora)
    const sixth = await invite(as);
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe("INVITATION_LIMIT");
    // família nova e vazia, mesma pessoa: segue bloqueada
    await dropFamily(as, "Casa 2");
    await newFamily(as, "Casa 3");
    expect((await invite(as)).status).toBe(429);
  });

  it("outra pessoa não é afetada pelo limite de quem abusou", async () => {
    const a = await asUser("abusa@exemplo.com", { name: "Abusa" });
    const b = await asUser("normal@exemplo.com", { name: "Normal" });
    await newFamily(a, "Casa A");
    await newFamily(b, "Casa B");
    for (let i = 0; i < 5; i++) await invite(a);
    expect((await invite(a)).status).toBe(429);
    expect((await invite(b)).status).toBe(201);
  });

  it("o reenvio com e-mail conta no limite; copiar o link não", async () => {
    const as = await asUser("reenvia@exemplo.com", { name: "Reenvia" });
    await newFamily(as, "Casa R");
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) ids.push((await invite(as)).body.invitation.id);
    for (let i = 0; i < 3; i++) {
      const r = await at(() => call(as, "POST", `/api/v1/invitations/${ids[0]}/resend`, {}));
      expect(r.status, JSON.stringify(r.body)).toBe(200); // 2 convites + 3 reenvios = 5
    }
    const link = await at(() => call(as, "POST", `/api/v1/invitations/${ids[1]}/link`, {}));
    expect(link.status, JSON.stringify(link.body)).toBe(200);
    const over = await at(() => call(as, "POST", `/api/v1/invitations/${ids[1]}/resend`, {}));
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("INVITATION_LIMIT");
  });
});
