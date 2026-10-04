import type { RequestContext, Tx } from "@/lib/api/types";
import { familiaScoped } from "@/modules/familia/repo";

/** ADR-013: todo acesso a dados de domínio passa por repositórios que exigem `familyId`. */
export function makeRepos(tx: Tx, ctx: Pick<RequestContext, "familyId">) {
  return {
    familia: familiaScoped(tx, ctx.familyId),
  };
}

export type Repos = ReturnType<typeof makeRepos>;
