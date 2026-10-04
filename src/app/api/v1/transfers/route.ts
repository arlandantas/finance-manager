import { withApi } from "@/lib/api/with-api";
import { CreateTransferSchema } from "@/modules/contas/schemas";
import { createTransfer } from "@/modules/contas/transfers";

export const dynamic = "force-dynamic";

// SDD-004 §3
export const POST = withApi({ body: CreateTransferSchema }, async ({ ctx, tx, body }) => ({
  status: 201,
  body: await createTransfer(tx, ctx, body),
}));
