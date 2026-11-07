import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { updateUnlinkedMember } from "@/modules/familia/member-profile";
import { UpdateUnlinkedMemberSchema } from "@/modules/familia/schemas";

export const dynamic = "force-dynamic";

// US-095 (ADR-038 §5): edita nome e e-mail do cadastro sem conta; só ADMIN, só na família do ator.
export const PATCH = withApi(
  { role: "ADMIN", body: UpdateUnlinkedMemberSchema },
  async ({ ctx, tx, body, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Membro não encontrado.");
    return { status: 200, body: await updateUnlinkedMember(tx, ctx, id.data, body) };
  },
);
