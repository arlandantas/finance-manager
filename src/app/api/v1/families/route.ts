import { withApi } from "@/lib/api/with-api";
import { CreateFamilySchema } from "@/modules/familia/schemas";
import { createFamily } from "@/modules/familia/service";

export const dynamic = "force-dynamic";

// SDD-003 §4.1
export const POST = withApi(
  { auth: "user", body: CreateFamilySchema },
  async ({ ctx, tx, body }) => ({
    status: 201,
    body: await createFamily(tx, ctx, body),
  }),
);
