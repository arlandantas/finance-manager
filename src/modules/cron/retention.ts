import type { Prisma } from "@/generated/prisma/client";
import { SESSION_ABSOLUTE_SECONDS } from "@/lib/auth/session";

// SEC-017a (SDD-028 §7.1/§7.2): expurgos técnicos da tabela de retenção. Cada tarefa é um DELETE por data,
// idempotente (rodar duas vezes não apaga a mais), registrada em `purge.ts` e executada pelo cron diário.
type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;
const ago = (now: Date, days: number) => new Date(now.getTime() - days * DAY);

/** Convites encerrados (ACCEPTED/CANCELED/EXPIRED/DECLINED) e pendentes vencidos: apagados 90 dias após a última data. */
export const INVITATION_RETENTION_DAYS = 90;
/** Sessão encerrada por remoção (DEV-91): a linha só serve ao aviso único; some após 7 dias. */
export const ENDED_SESSION_RETENTION_DAYS = 7;
/** Chaves de idempotência: 24 h (ADR-009 §5). */
export const IDEMPOTENCY_RETENTION_HOURS = 24;

/** `sessions` vencidas por ociosidade (`expires`) ou pelo prazo absoluto (`createdAt` + 90 d) e as encerradas há > 7 dias. */
export async function purgeSessions(tx: Tx, now: Date): Promise<number> {
  const absoluteCutoff = new Date(now.getTime() - SESSION_ABSOLUTE_SECONDS * 1000);
  const res = await tx.session.deleteMany({
    where: {
      OR: [
        { expires: { lte: now } },
        { createdAt: { lte: absoluteCutoff } },
        { endedAt: { lte: ago(now, ENDED_SESSION_RETENTION_DAYS) } },
      ],
    },
  });
  return res.count;
}

/** `verification_tokens` vencidos. */
export async function purgeVerificationTokens(tx: Tx, now: Date): Promise<number> {
  const res = await tx.verificationToken.deleteMany({ where: { expires: { lte: now } } });
  return res.count;
}

/**
 * `invitations` encerradas há mais de 90 dias, pela última data do status: `acceptedAt`, `canceledAt`,
 * `declinedAt` ou `expiresAt` (EXPIRED e PENDING vencida). O vínculo vive em `members`; o evento
 * `MEMBER_JOINED` guarda o `invitationId` sem FK (referência pendente aceitável).
 */
export async function purgeInvitations(tx: Tx, now: Date): Promise<number> {
  const cutoff = ago(now, INVITATION_RETENTION_DAYS);
  const res = await tx.invitation.deleteMany({
    where: {
      OR: [
        { status: "ACCEPTED", acceptedAt: { lt: cutoff } },
        { status: "CANCELED", canceledAt: { lt: cutoff } },
        { status: "DECLINED", declinedAt: { lt: cutoff } },
        { status: { in: ["EXPIRED", "PENDING"] }, expiresAt: { lt: cutoff } },
      ],
    },
  });
  return res.count;
}

/** `idempotency_records` com mais de 24 h (antes só limpas no caminho da requisição). */
export async function purgeIdempotency(tx: Tx, now: Date): Promise<number> {
  const res = await tx.idempotencyRecord.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - IDEMPOTENCY_RETENTION_HOURS * 3_600_000) } },
  });
  return res.count;
}
