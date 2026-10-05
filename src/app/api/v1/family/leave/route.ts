import { withApi } from "@/lib/api/with-api";
import { removeMember } from "@/modules/familia/removal";
import { RemoveMemberSchema } from "@/modules/familia/schemas";

export const dynamic = "force-dynamic";

// SDD-012 §3.2: qualquer membro sai (o alvo é o próprio)
export const POST = withApi({ body: RemoveMemberSchema }, async ({ ctx, tx, body }) => ({
  status: 200,
  body: await removeMember(tx, ctx, ctx.memberId, body, "LEFT"),
}));
