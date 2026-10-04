import type { Prisma } from "@/generated/prisma/client";
import type { Clock } from "@/lib/clock";

export type Tx = Prisma.TransactionClient;
export type Role = "ADMIN" | "MEMBER";

export type UserContext = {
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  clock: Clock;
  requestId: string;
};

export type RequestContext = UserContext & {
  memberId: string;
  familyId: string;
  role: Role;
};

export type ApiResult<T = unknown> = {
  status: number;
  body: T;
  headers?: Record<string, string>;
  /**
   * Efeito colateral que só pode rodar depois do commit (ex.: enviar e-mail). Pode devolver campos
   * que serão mesclados (raso) ao corpo da resposta e ao registro de idempotência.
   */
  afterCommit?: () => Promise<Record<string, unknown> | undefined>;
};
