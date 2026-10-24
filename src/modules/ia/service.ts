import { forbidden } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { getLlmConfig } from "@/modules/ia/config";
import type { AiUsageDTO } from "@/modules/ia/dto";
import { resetsOn } from "@/modules/ia/month";
import { microToCentsCeil } from "@/modules/ia/pricing";
import { readUsage } from "@/modules/ia/repo";

/**
 * GET /ai/usage (SDD-021 §3): só ADMIN. `capInCents = null` quando a IA não está disponível
 * (`AI_FEATURES_ENABLED=false`): a tela mostra "A IA ainda não está disponível neste app".
 */
export async function getAiUsage(tx: Tx, ctx: RequestContext): Promise<AiUsageDTO> {
  if (ctx.role !== "ADMIN") throw forbidden("Só o Administrador pode ver o consumo de IA");
  const cfg = getLlmConfig();
  const snap = await readUsage(tx, ctx.familyId, cfg.LLM_MONTHLY_CAP_CENTS, ctx.clock.now());
  const usedInCents = microToCentsCeil(snap.spentMicro);
  const available = cfg.featuresEnabled;
  return {
    month: snap.month,
    capInCents: available ? snap.capCents : null,
    usedInCents,
    remainingInCents: available ? Math.max(snap.capCents - usedInCents, 0) : null,
    resetsOn: resetsOn(snap.month),
    byPurpose: snap.byPurpose.map((p) => ({
      purpose: p.purpose,
      usedInCents: microToCentsCeil(p.micro),
      calls: p.calls,
    })),
  };
}
