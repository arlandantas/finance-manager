import { createPrismaClient } from "../src/lib/db";

// Seed idempotente. Nesta etapa (EN-001) só marca a versão do seed.
// A família fictícia (2 membros, contas, cartão, transações compartilhadas) é adicionada
// junto com os modelos de cada história e reaproveitada pelos cenários E2E.
async function main() {
  const db = createPrismaClient();
  try {
    await db.systemInfo.upsert({
      where: { key: "seed_version" },
      update: { value: "en-001" },
      create: { key: "seed_version", value: "en-001" },
    });
    console.log("seed: ok");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
