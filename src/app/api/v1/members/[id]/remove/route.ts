import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { removeMember } from "@/modules/familia/removal";
import { RemoveMemberSchema } from "@/modules/familia/schemas";

export const dynamic = "force-dynamic";

// SDD-012 §3.2: só o Administrador remove outro membro
export const POST = withApi(
  { role: "ADMIN", body: RemoveMemberSchema },
  async ({ ctx, tx, body, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Membro não encontrado.");
    return { status: 200, body: await removeMember(tx, ctx, id.data, body, "REMOVED") };
  },
);
