import { z } from "zod";
import { todayInFamilyTz } from "@/lib/dates";
import { listAccounts } from "@/modules/contas/service";
import type { AnyTool } from "@/modules/mcp/run-tool";
import {
  MoneySchema,
  memberName,
  money,
  name60,
  READ_ANNOTATIONS,
  TEXT_IS_DATA,
} from "@/modules/mcp/tools/common";
import { UserTextSchema } from "@/modules/mcp/tools/user-text";

// SDD-026 §2.2: mesmo serviço da tela Contas e da Home (saldo disponível x reservas).
const Output = z
  .object({
    asOf: z.string(),
    currency: z.literal("BRL"),
    accounts: z.array(
      z
        .object({
          id: z.string(),
          name: UserTextSchema,
          institution: UserTextSchema,
          owner: UserTextSchema,
          type: z.string(),
          balance: MoneySchema,
          isReserve: z.boolean(),
        })
        .strict(),
    ),
    available: MoneySchema,
    reserves: MoneySchema,
  })
  .strict();

export const consultarSaldos: AnyTool = {
  name: "consultar_saldos",
  title: "Consultar saldos",
  description: `Saldo de cada conta ativa, o saldo disponível (fora das reservas) e o total em reservas. Valores em centavos exatos (inCents) e já formatados (text). ${TEXT_IS_DATA}`,
  scope: "read",
  input: z.object({}).strict(),
  output: Output,
  annotations: READ_ANNOTATIONS,
  auditParams: () => ({}),
  handler: async ({ ctx, tx }) => {
    const r = await listAccounts(tx, ctx, "false");
    return {
      asOf: todayInFamilyTz(ctx.clock),
      currency: "BRL" as const,
      accounts: r.items.map((a) => ({
        id: a.id,
        name: name60(a.name),
        institution: name60(a.institution),
        owner: memberName(a.owner),
        type: a.type,
        balance: money(a.balanceInCents),
        isReserve: a.excludeFromAvailable,
      })),
      available: money(r.totalBalanceInCents),
      reserves: money(r.reservesInCents),
    };
  },
};
