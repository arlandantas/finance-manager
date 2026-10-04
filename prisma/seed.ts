import { createPrismaClient } from "../src/lib/db";
import {
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeInvoice,
  makeInvoicePayment,
  makePlannedExpense,
  makeTransaction,
  makeTransfer,
  useFactoryDb,
} from "../tests/support/factories";

// Seed idempotente (SDD-006 §5). Dataset de demonstração: "Família Silva" (Mariana ADMIN e Lucas MEMBER)
// com contas, cartão, lançamentos, uma despesa prevista e um acerto em aberto, tudo relativo a "hoje".
// Sem sessões: o login é sempre pelo dev-login (atalhos Mariana/Lucas em /login).
const DAY = 86_400_000;
const iso = (offsetDays: number) =>
  new Date(Date.now() - 3 * 3_600_000 + offsetDays * DAY).toISOString().slice(0, 10); // America/Sao_Paulo

async function demo() {
  const fx = await makeFamily({ name: "Família Silva" });
  const corrente = await makeAccount(fx, {
    name: "Conta corrente",
    owner: "Mariana",
    institution: "Nubank",
    openingBalanceInCents: 425_000,
    openingDate: iso(-40),
  });
  const poupanca = await makeAccount(fx, {
    name: "Poupança",
    owner: "Mariana",
    type: "SAVINGS",
    institution: "Caixa",
    openingBalanceInCents: 1_200_000,
    openingDate: iso(-40),
  });
  const lucasConta = await makeAccount(fx, {
    name: "Conta Lucas",
    owner: "Lucas",
    institution: "Itaú",
    openingBalanceInCents: 280_000,
    openingDate: iso(-40),
  });
  await makeAccount(fx, {
    name: "Dinheiro",
    owner: "Lucas",
    type: "CASH",
    openingBalanceInCents: 15_000,
    openingDate: iso(-40),
  });
  const card = await makeCard(fx, {
    name: "Nubank Roxinho",
    owner: "Mariana",
    institution: "Nubank",
    limitInCents: 800_000,
    closingDay: 25,
    dueDay: 5,
  });

  // Receitas
  await makeTransaction(fx, {
    account: corrente,
    type: "INCOME",
    category: "Salário",
    amountInCents: 650_000,
    occurredOn: iso(-3),
    author: "Mariana",
    description: "Salário Mariana",
  });
  await makeTransaction(fx, {
    account: lucasConta,
    type: "INCOME",
    category: "Salário",
    amountInCents: 480_000,
    occurredOn: iso(-3),
    author: "Lucas",
    description: "Salário Lucas",
  });
  // Despesas compartilhadas (Mariana paga mais => acerto em aberto: Lucas deve a Mariana)
  const shared: Array<[string, string, number, number, "Mariana" | "Lucas"]> = [
    ["Supermercado", "Compras do mês", 62_000, -2, "Mariana"],
    ["Moradia", "Aluguel", 180_000, -3, "Mariana"],
    ["Contas e serviços", "Internet", 12_000, -2, "Mariana"],
    ["Lazer e restaurantes", "Jantar de sábado", 18_500, -1, "Lucas"],
    ["Transporte", "Combustível", 25_000, -1, "Lucas"],
    ["Supermercado", "Feira", 9_800, -12, "Lucas"],
    ["Saúde", "Farmácia", 14_000, -15, "Mariana"],
  ];
  for (const [category, description, amountInCents, off, who] of shared) {
    await makeTransaction(fx, {
      account: who === "Mariana" ? corrente : lucasConta,
      category,
      amountInCents,
      occurredOn: iso(off),
      author: who,
      description,
    });
  }
  await makeTransfer(fx, {
    from: corrente,
    to: poupanca,
    amountInCents: 100_000,
    occurredOn: iso(-2),
  });
  // Despesa individual (não entra no acerto)
  await makeTransaction(fx, {
    account: lucasConta,
    category: "Educação",
    amountInCents: 29_000,
    occurredOn: iso(-5),
    author: "Lucas",
    shared: false,
    description: "Curso de inglês",
  });

  // Cartão: fatura de agosto (paga), de setembro (fechada, a pagar) e a aberta
  const aug = await makeInvoice(fx, card, "2026-08");
  await makeCardPurchase(fx, {
    card,
    amountInCents: 21_000,
    occurredOn: "2026-08-14",
    category: "Lazer e restaurantes",
    description: "Cinema e pizza",
  });
  await makeInvoicePayment(fx, {
    card,
    invoice: aug,
    account: corrente,
    amountInCents: 21_000,
    paidOn: "2026-09-05",
  });
  await makeCardPurchase(fx, {
    card,
    amountInCents: 32_000,
    occurredOn: iso(-20),
    category: "Supermercado",
    description: "Atacado",
  });
  await makeCardPurchase(fx, {
    card,
    amountInCents: 15_900,
    occurredOn: iso(-18),
    category: "Saúde",
    description: "Consulta",
  });
  await makeCardPurchase(fx, {
    card,
    amountInCents: 8_990,
    occurredOn: iso(-1),
    category: "Transporte",
    description: "Aplicativo de transporte",
    payer: "Mariana",
    author: "Mariana",
  });

  // Previsão
  await makePlannedExpense(fx, {
    description: "Condomínio",
    amountInCents: 65_000,
    dueOn: iso(6),
    category: "Moradia",
    responsible: "Mariana",
  });
  return fx;
}

async function main() {
  const db = createPrismaClient();
  useFactoryDb(db);
  try {
    await db.systemInfo.upsert({
      where: { key: "seed_version" },
      update: { value: "demo-1" },
      create: { key: "seed_version", value: "demo-1" },
    });
    const exists = await db.family.findFirst({ where: { name: "Família Silva" } });
    if (!exists) {
      const fx = await demo();
      // As fábricas criam sessões para os testes; o seed não deixa sessões (login só por dev-login).
      await db.session.deleteMany({ where: { userId: { in: fx.members.map((m) => m.userId) } } });
      console.log("seed: Família Silva (demonstração) criada");
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
