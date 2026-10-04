import { withApi } from "@/lib/api/with-api";
import { CreateAccountSchema } from "@/modules/contas/schemas";
import { createAccount, listAccounts } from "@/modules/contas/service";

export const dynamic = "force-dynamic";

// SDD-004 §3
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await listAccounts(tx, ctx),
}));

export const POST = withApi({ body: CreateAccountSchema }, async ({ ctx, tx, body }) => ({
  status: 201,
  body: await createAccount(tx, ctx, body),
}));
