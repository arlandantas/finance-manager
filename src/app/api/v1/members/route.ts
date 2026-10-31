import { withApi } from "@/lib/api/with-api";
import { createUnlinkedMember } from "@/modules/familia/members";
import { CreateUnlinkedMemberSchema } from "@/modules/familia/schemas";

export const dynamic = "force-dynamic";

// US-092b (SDD-033 §4.1): somente ADMIN; cria só na família do ator.
export const POST = withApi(
  { role: "ADMIN", body: CreateUnlinkedMemberSchema },
  async ({ ctx, tx, body }) => ({ status: 201, body: await createUnlinkedMember(tx, ctx, body) }),
);
