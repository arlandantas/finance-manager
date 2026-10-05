import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { UpdateFamilySchema } from "@/modules/familia/schemas";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
const mariana = () => fx.byName.Mariana?.as ?? null; // ADMIN
const lucas = () => fx.byName.Lucas?.as ?? null; // MEMBER
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const rename = (as: ReturnType<typeof mariana>, name: string, version = 1) =>
  at(() => call(as, "PATCH", "/api/v1/family", { name, version }));
const role = (as: ReturnType<typeof mariana>, id: string, r: string) =>
  at(() => call(as, "PATCH", `/api/v1/members/${id}`, { role: r }));

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
});

describe("US-034 editar família e papéis", () => {
  it("schema: nome vazio, curto e longo => mesma mensagem", () => {
    for (const name of ["", "a", "x".repeat(61)]) {
      expect(UpdateFamilySchema.safeParse({ version: 1, name }).error?.issues[0]?.message).toBe(
        "Informe um nome com 2 a 60 caracteres",
      );
    }
  });

  it("ADMIN renomeia: 200, version 2, FamilyEvent; MEMBER => 403; GET /family traz nome e eventos", async () => {
    const r = await rename(mariana(), "  Casa Silva ");
    expect(r.status).toBe(200);
    expect(r.body.family).toMatchObject({ name: "Casa Silva", version: 2 });
    expect(await db.familyEvent.count({ where: { type: "FAMILY_RENAMED" } })).toBe(1);
    expect((await rename(lucas(), "Outra")).status).toBe(403);
    const g = await at(() => call(lucas(), "GET", "/api/v1/family"));
    expect(g.body.family.name).toBe("Casa Silva");
    expect(g.body.events[0]).toMatchObject({
      type: "FAMILY_RENAMED",
      actor: { name: "Mariana Silva" },
    });
    expect(g.body.members.every((m: { canChangeRole: boolean }) => m.canChangeRole === false)).toBe(
      true,
    );
  });

  it("conflito de versão cita quem alterou; mesmo nome não grava evento", async () => {
    await role(mariana(), mid("Lucas"), "ADMIN");
    await rename(lucas(), "Casa Lucas");
    const stale = await rename(mariana(), "Casa Silva", 1);
    expect(stale.status).toBe(409);
    expect(stale.body.error.message).toBe(
      "A família foi alterada por Lucas. Recarregue para continuar.",
    );
    const same = await rename(mariana(), "Casa Lucas", 2);
    expect(same.status).toBe(200);
    expect(await db.familyEvent.count({ where: { type: "FAMILY_RENAMED" } })).toBe(1);
  });

  it("promover e rebaixar com outro Administrador; sem mudança => 200 sem evento; efeito imediato", async () => {
    expect((await role(mariana(), mid("Lucas"), "ADMIN")).status).toBe(200);
    expect(await db.familyEvent.count({ where: { type: "ROLE_CHANGED" } })).toBe(1);
    expect((await role(mariana(), mid("Lucas"), "ADMIN")).status).toBe(200);
    expect(await db.familyEvent.count({ where: { type: "ROLE_CHANGED" } })).toBe(1);
    // Lucas já pode alterar a regra? (papel relido por requisição)
    expect((await role(lucas(), mid("Mariana"), "MEMBER")).status).toBe(200);
    // Mariana, agora Membro, perde as permissões já na requisição seguinte
    const put = await at(() => call(mariana(), "PUT", "/api/v1/split-rule", { kind: "EQUAL" }));
    expect(put.status).toBe(403);
  });

  it("último Administrador não pode ser rebaixado (422 LAST_ADMIN com a mensagem)", async () => {
    const r = await role(mariana(), mid("Mariana"), "MEMBER");
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("LAST_ADMIN");
    expect(r.body.error.message).toBe(
      "A família precisa de pelo menos um Administrador. Promova outro membro antes.",
    );
    expect((await db.member.findUniqueOrThrow({ where: { id: mid("Mariana") } })).role).toBe(
      "ADMIN",
    );
  });

  it("corrida: dois Administradores se rebaixam ao mesmo tempo => 1×200 e o outro 422/403; sempre sobra 1 ADMIN", async () => {
    for (let i = 0; i < 6; i++) {
      await resetDb();
      fx = await makeFamily();
      await role(mariana(), mid("Lucas"), "ADMIN");
      const [a, b] = await Promise.all([
        role(mariana(), mid("Lucas"), "MEMBER"),
        role(lucas(), mid("Mariana"), "MEMBER"),
      ]);
      // o perdedor recebe 422 (último ADMIN) ou 403 (já perdeu o papel quando a requisição foi lida)
      const sorted = [a.status, b.status].sort();
      expect(sorted[0]).toBe(200);
      expect([403, 422]).toContain(sorted[1]);
      expect(await db.member.count({ where: { role: "ADMIN" } })).toBe(1);
    }
  }, 120_000);

  it("isolamento: membro de outra família => 404; corpo estrito", async () => {
    const other = await makeFamily({ uniqueEmails: true, name: "Souza" });
    expect((await role(mariana(), other.members[0]?.memberId as string, "MEMBER")).status).toBe(
      404,
    );
    expect(
      (
        await at(() =>
          call(mariana(), "PATCH", "/api/v1/family", { name: "Zz", version: 1, familyId: "x" }),
        )
      ).status,
    ).toBe(400);
  });
});
