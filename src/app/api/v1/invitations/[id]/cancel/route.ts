import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { cancelInvitation } from "@/modules/familia/invitations/service";

export const dynamic = "force-dynamic";

export const POST = withApi(
  { role: "ADMIN", body: z.object({}).strict() },
  async ({ ctx, tx, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Convite não encontrado.");
    return { status: 200, body: await cancelInvitation(tx, ctx, id.data) };
  },
);
