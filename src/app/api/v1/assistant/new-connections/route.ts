import { withApi } from "@/lib/api/with-api";
import { listNewConnectionNotices } from "@/modules/mcp/new-connection";

export const dynamic = "force-dynamic";

// SEC-011 (SDD-028 §4.4a): avisos de conexão nova do membro, para o cartão da Home.
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await listNewConnectionNotices(tx, ctx),
}));
