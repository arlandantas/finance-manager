import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { InMemoryMailer, setMailer } from "@/lib/mail";
import { call } from "../support/call";
import { resetDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

// SEC-037 (D-GES-46): e-mail de aviso depois de excluir a conta ou a família (sem reautenticação).
const NOW = "2026-11-05T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
type Who = NonNullable<FamilyFixture["byName"][string]>["as"];
let mailer: InMemoryMailer;
let fx: FamilyFixture;

beforeEach(async () => {
  await resetDb();
  mailer = new InMemoryMailer();
  setMailer(mailer);
});
afterEach(() => setMailer(null));

describe("SEC-037 aviso por e-mail nas exclusões", () => {
  it("excluir a conta avisa o e-mail ANTIGO uma vez; erro de validação não avisa", async () => {
    fx = await makeFamily({ name: "Família Silva" });
    const lucas = fx.byName.Lucas?.as as Who;
    const bad = await at(() =>
      call(lucas, "POST", "/api/v1/me/delete-account", { confirmEmail: "outro@x.com" }),
    );
    expect(bad.status).toBe(422);
    expect(mailer.sent).toHaveLength(0);
    const ok = await at(() =>
      call(lucas, "POST", "/api/v1/me/delete-account", {
        confirmEmail: lucas.email,
        acknowledgeSettlement: true,
      }),
    );
    expect(ok.status).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      to: "lucas@exemplo.com",
      subject: "Sua conta foi excluída",
    });
    expect(mailer.sent[0]?.text).toContain("Se não foi você");
  });

  it("excluir a família avisa o Administrador; nome errado não avisa", async () => {
    fx = await makeFamily({
      name: "Família Silva",
      members: [{ email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" }],
    });
    const mariana = fx.byName.Mariana?.as as Who;
    const bad = await at(() =>
      call(mariana, "POST", "/api/v1/family/delete", { confirmFamilyName: "Errado" }),
    );
    expect(bad.status).toBe(422);
    expect(mailer.sent).toHaveLength(0);
    const ok = await at(() =>
      call(mariana, "POST", "/api/v1/family/delete", { confirmFamilyName: "Família Silva" }),
    );
    expect(ok.status).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      to: "mariana@exemplo.com",
      subject: "Sua família foi excluída",
    });
    expect(mailer.sent[0]?.text).toContain("Família Silva");
  });

  it("falha no envio não desfaz a exclusão", async () => {
    fx = await makeFamily({
      name: "Família Silva",
      members: [{ email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" }],
    });
    mailer.failWith = new Error("smtp fora");
    const mariana = fx.byName.Mariana?.as as Who;
    const ok = await at(() =>
      call(mariana, "POST", "/api/v1/family/delete", { confirmFamilyName: "Família Silva" }),
    );
    expect(ok.status).toBe(200);
  });
});
