import { withApi } from "@/lib/api/with-api";
import { updateFamily } from "@/modules/familia/manage";
import { UpdateFamilySchema } from "@/modules/familia/schemas";
import { getFamily } from "@/modules/familia/service";

export const dynamic = "force-dynamic";

// SDD-003 §4.5
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await getFamily(tx, ctx),
}));

// SDD-012 §3.2: só o Administrador edita o nome
export const PATCH = withApi(
  { role: "ADMIN", body: UpdateFamilySchema },
  async ({ ctx, tx, body }) => ({ status: 200, body: await updateFamily(tx, ctx, body) }),
);
