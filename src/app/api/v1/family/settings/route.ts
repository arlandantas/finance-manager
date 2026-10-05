import { withApi } from "@/lib/api/with-api";
import { UpdateFamilySettingsSchema } from "@/modules/familia/schemas";
import { updateFamilySettings } from "@/modules/familia/settings";

export const dynamic = "force-dynamic";

// SDD-011 §3: só o Administrador liga/desliga o acerto de contas
export const PATCH = withApi(
  { role: "ADMIN", body: UpdateFamilySettingsSchema },
  async ({ ctx, tx, body }) => ({ status: 200, body: await updateFamilySettings(tx, ctx, body) }),
);
