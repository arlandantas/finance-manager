import { withApi } from "@/lib/api/with-api";
import { CreateAccountSchema, ListAccountsQuerySchema } from "@/modules/contas/schemas";
import { createAccount, listAccounts } from "@/modules/contas/service";

export const dynamic = "force-dynamic";

// SDD-004 §3
export const GET = withApi({ query: ListAccountsQuerySchema }, async ({ ctx, tx, query }) => ({
  status: 200,
  body: await listAccounts(tx, ctx, query.archived),
}));

export const POST = withApi({ body: CreateAccountSchema }, async ({ ctx, tx, body }) => ({
  status: 201,
  body: await createAccount(tx, ctx, body),
}));
