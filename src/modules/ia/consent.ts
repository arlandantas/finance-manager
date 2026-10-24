import { badRequest, conflict, forbidden, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { getLlmConfig } from "@/modules/ia/config";
import {
  AiPurposeSchema,
  type DisableConsentInput,
  type EnableConsentInput,
} from "@/modules/ia/consent-schemas";
import { consentTextFor } from "@/modules/ia/consent-texts";
import type { AiFeatureStateDTO, AiSettingsDTO } from "@/modules/ia/dto";
import { aiDisabled, aiUnavailable, purposeNotAvailable } from "@/modules/ia/errors";
import type { LlmPurpose } from "@/modules/ia/port";
import { getAiUsage } from "@/modules/ia/service";

// SDD-022 / ADR-029 §1: opt-in por família e finalidade. Estado efetivo é CALCULADO do último evento.

const PURPOSES: LlmPurpose[] = ["SPENDING_ANALYSIS", "INVOICE_IMPORT"];
const ONLY_ADMIN = "Só o Administrador pode ligar ou desligar";

type LastEvent = {
  action: "ENABLED" | "DISABLED";
  textVersion: number;
  createdAt: Date;
  memberId: string;
};

async function lastEvent(tx: Tx, familyId: string, purpose: LlmPurpose): Promise<LastEvent | null> {
  const rows = await tx.$queryRaw<LastEvent[]>`
    SELECT action::text AS action, "textVersion", "createdAt", "memberId" FROM ai_consent_events
    WHERE "familyId" = ${familyId}::uuid AND purpose = ${purpose}::"LlmPurpose"
    ORDER BY "createdAt" DESC, id DESC LIMIT 1`;
  return rows[0] ?? null;
}

type ConsentState = AiFeatureStateDTO["state"];

/** Efetivo = último evento ENABLED e com a versão vigente do texto. */
function stateOf(
  last: LastEvent | null,
  current: number | undefined,
): "ON" | "OFF" | "NEEDS_RECONSENT" {
  if (!last || last.action === "DISABLED") return "OFF";
  return current !== undefined && last.textVersion === current ? "ON" : "NEEDS_RECONSENT";
}

/**
 * Guarda de envio (SDD-022 §2): roda na MESMA transação da reserva, com `families FOR SHARE`, para que
 * ligar/desligar concorrente (`FOR UPDATE`) espere ou vença. Nada sai depois de o desligar ter confirmado.
 */
export async function assertConsentEffective(
  tx: Tx,
  familyId: string,
  purpose: LlmPurpose,
): Promise<void> {
  const text = consentTextFor(purpose);
  if (!text) throw purposeNotAvailable();
  await tx.$queryRaw`SELECT id FROM families WHERE id = ${familyId}::uuid FOR SHARE`;
  const state = stateOf(await lastEvent(tx, familyId, purpose), text.version);
  if (state !== "ON") {
    throw aiDisabled(
      state === "NEEDS_RECONSENT"
        ? "O texto de consentimento mudou. Peça ao Administrador para confirmar de novo"
        : "A análise por IA está desligada nesta família",
      { state },
    );
  }
}

async function featureDto(
  tx: Tx,
  familyId: string,
  purpose: LlmPurpose,
  featuresEnabled: boolean,
): Promise<AiFeatureStateDTO> {
  const text = consentTextFor(purpose);
  const available = featuresEnabled && text !== undefined;
  const last = text ? await lastEvent(tx, familyId, purpose) : null;
  let lastChange: AiFeatureStateDTO["lastChange"] = null;
  if (last) {
    const m = await tx.member.findFirst({
      where: { id: last.memberId, familyId },
      include: { user: true },
    });
    lastChange = {
      action: last.action,
      at: last.createdAt.toISOString(),
      by: {
        id: last.memberId,
        name: m ? (m.user.name ?? m.user.email.split("@")[0] ?? "Membro") : "Membro",
        former: m?.removedAt != null,
      },
      textVersion: last.textVersion,
    };
  }
  const state: ConsentState = available ? stateOf(last, text?.version) : "UNAVAILABLE";
  return {
    purpose,
    available,
    state,
    currentText: text ?? { version: 0, summary: "", details: [] },
    lastChange,
  };
}

/** Estado de uma finalidade para telas de histórias (ex.: pré-visualização da análise). */
export function getFeatureState(
  tx: Tx,
  familyId: string,
  purpose: LlmPurpose,
): Promise<AiFeatureStateDTO> {
  return featureDto(tx, familyId, purpose, getLlmConfig().featuresEnabled);
}

/** GET /ai/settings (todos os membros). */
export async function getAiSettings(tx: Tx, ctx: RequestContext): Promise<AiSettingsDTO> {
  const cfg = getLlmConfig();
  const fam = await tx.family.findFirst({ where: { id: ctx.familyId }, select: { version: true } });
  const features = [];
  for (const p of PURPOSES)
    features.push(await featureDto(tx, ctx.familyId, p, cfg.featuresEnabled));
  return {
    canEdit: ctx.role === "ADMIN",
    features,
    usage: ctx.role === "ADMIN" ? await getAiUsage(tx, ctx) : null,
    familyVersion: fam?.version ?? 1,
  };
}

export function parsePurpose(raw: string): LlmPurpose {
  const p = AiPurposeSchema.safeParse(raw);
  if (!p.success) throw badRequest("VALIDATION_ERROR", "Finalidade inválida");
  return p.data;
}

async function lockFamily(tx: Tx, ctx: RequestContext, version: number) {
  const rows = await tx.$queryRaw<Array<{ version: number }>>`
    SELECT version FROM families WHERE id = ${ctx.familyId}::uuid FOR UPDATE`;
  const fam = rows[0];
  if (!fam || fam.version !== version) {
    throw conflict("VERSION_CONFLICT", "A família foi alterada. Recarregue para continuar.");
  }
}

async function record(
  tx: Tx,
  ctx: RequestContext,
  purpose: LlmPurpose,
  action: "ENABLED" | "DISABLED",
  textVersion: number,
  last: LastEvent | null,
) {
  // Sob `families FOR UPDATE` a ordem é total; o relógio injetável pode repetir o instante, então
  // garantimos `createdAt` estritamente crescente por (família, finalidade) para o "último evento" ser exato.
  const now = ctx.clock.now();
  const at = last && last.createdAt >= now ? new Date(last.createdAt.getTime() + 1) : now;
  await tx.$executeRaw`INSERT INTO ai_consent_events (id, "familyId", purpose, action, "textVersion", "memberId", "createdAt")
    VALUES (gen_random_uuid(), ${ctx.familyId}::uuid, ${purpose}::"LlmPurpose", ${action}::"AiConsentAction",
            ${textVersion}, ${ctx.memberId}::uuid, ${at})`;
  await tx.family.update({
    where: { id: ctx.familyId },
    data: { version: { increment: 1 }, updatedByMemberId: ctx.memberId },
  });
  await tx.familyEvent.create({
    data: {
      familyId: ctx.familyId,
      type: "AI_CONSENT_CHANGED",
      actorMemberId: ctx.memberId,
      changes: { purpose, action, textVersion },
    },
  });
}

/** POST /ai/consents/:purpose/enable (ADMIN). Idempotente: já efetivo ⇒ 200 sem novo evento. */
export async function enableConsent(
  tx: Tx,
  ctx: RequestContext,
  purpose: LlmPurpose,
  input: EnableConsentInput,
): Promise<AiSettingsDTO> {
  if (ctx.role !== "ADMIN") throw forbidden(ONLY_ADMIN);
  const text = consentTextFor(purpose);
  if (!text) throw purposeNotAvailable();
  if (!getLlmConfig().featuresEnabled) throw aiUnavailable();
  await lockFamily(tx, ctx, input.familyVersion);
  if (input.textVersion !== text.version) {
    throw unprocessable("CONSENT_TEXT_OUTDATED", "O texto mudou. Leia a nova versão para ligar");
  }
  const last = await lastEvent(tx, ctx.familyId, purpose);
  if (stateOf(last, text.version) !== "ON") {
    await record(tx, ctx, purpose, "ENABLED", text.version, last);
  }
  return getAiSettings(tx, ctx);
}

/** POST /ai/consents/:purpose/disable (ADMIN). Não apaga nada; já desligado ⇒ 200 sem evento. */
export async function disableConsent(
  tx: Tx,
  ctx: RequestContext,
  purpose: LlmPurpose,
  input: DisableConsentInput,
): Promise<AiSettingsDTO> {
  if (ctx.role !== "ADMIN") throw forbidden(ONLY_ADMIN);
  const text = consentTextFor(purpose);
  if (!text) throw purposeNotAvailable();
  await lockFamily(tx, ctx, input.familyVersion);
  const last = await lastEvent(tx, ctx.familyId, purpose);
  if (last?.action === "ENABLED") {
    await record(tx, ctx, purpose, "DISABLED", text.version, last);
  }
  return getAiSettings(tx, ctx);
}
