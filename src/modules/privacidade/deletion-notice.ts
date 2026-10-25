import { logger } from "@/lib/logger";
import { getMailer } from "@/lib/mail";

// SEC-037 (D-GES-46): aviso por e-mail depois de uma exclusão irreversível, para o titular reagir se não foi ele.
// Melhor esforço, depois do commit: falha só vira log. Sem dado financeiro; a reautenticação é decisão do usuário.
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 60);

export function deletionNoticeEmail(a: {
  kind: "ACCOUNT" | "FAMILY";
  familyName?: string;
  at: Date;
}) {
  const when = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(a.at);
  const what =
    a.kind === "ACCOUNT"
      ? "Sua conta no Finance Manager foi excluída"
      : `A família ${oneLine(a.familyName ?? "")} foi excluída do Finance Manager`;
  const subject = a.kind === "ACCOUNT" ? "Sua conta foi excluída" : "Sua família foi excluída";
  const text = [
    "Olá!",
    "",
    `${what} em ${when}.`,
    "A exclusão é definitiva. Se não foi você, fale com o suporte do aplicativo agora.",
  ].join("\n");
  const html = [
    "<p>Olá!</p>",
    `<p>${escapeHtml(what)} em ${escapeHtml(when)}.</p>`,
    "<p>A exclusão é definitiva. Se não foi você, fale com o suporte do aplicativo agora.</p>",
  ].join("\n");
  return { subject, text, html };
}

export async function sendDeletionNotice(
  to: string,
  a: { kind: "ACCOUNT" | "FAMILY"; familyName?: string; at: Date },
): Promise<undefined> {
  try {
    await getMailer().send({ to, ...deletionNoticeEmail(a) });
  } catch (e) {
    logger.warn(
      { kind: a.kind, err: e instanceof Error ? e.name : "erro" },
      "aviso de exclusão não enviado",
    );
  }
  return undefined;
}
