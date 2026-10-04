import { createPrismaClient } from "../src/lib/db";
import { makeFamily, useFactoryDb } from "../tests/support/factories";

// Seed idempotente (SDD-006 §5). Dataset de demonstração: "Família Silva" (Mariana ADMIN e Lucas MEMBER).
// Sem sessões: o login é sempre pelo dev-login (atalhos Mariana/Lucas em /login).
async function main() {
  const db = createPrismaClient();
  useFactoryDb(db);
  try {
    await db.systemInfo.upsert({
      where: { key: "seed_version" },
      update: { value: "us-001" },
      create: { key: "seed_version", value: "us-001" },
    });
    const exists = await db.family.findFirst({ where: { name: "Família Silva" } });
    if (!exists) {
      const fx = await makeFamily({ name: "Família Silva" });
      // As fábricas criam sessões para os testes; o seed não deixa sessões (login só por dev-login).
      await db.session.deleteMany({ where: { userId: { in: fx.members.map((m) => m.userId) } } });
      console.log("seed: Família Silva criada");
    }
    console.log("seed: ok");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
