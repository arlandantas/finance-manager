import { INVITATION_TTL_DAYS } from "@/modules/familia/invitations/constants";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** SEC-014: nome livre (família, convidante) sem controles/quebras de linha, em linha única e curto. */
export function cleanLabel(raw: string, max = 40): string {
  const flat = raw
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ");
  const one = flat.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

/** E-mail do convite (SDD-003 §5.3): puro e coberto por snapshot. Sem imagens externas. */
export function invitationEmail(a: {
  inviterName: string;
  familyName: string;
  inviteUrl: string;
  email: string;
}): { subject: string; text: string; html: string } {
  // SEC-014: o ASSUNTO nunca carrega o nome livre da família (vetor de phishing); só o convidante, saneado.
  const inviterName = cleanLabel(a.inviterName, 60);
  const familyName = cleanLabel(a.familyName, 60);
  const subject = `${inviterName} convidou você para o Finance Manager`;
  const text = [
    "Olá!",
    "",
    `${inviterName} convidou você para a família ${familyName}.`,
    "",
    `Para entrar, abra o link: ${a.inviteUrl}`,
    "",
    `O convite vale por ${INVITATION_TTL_DAYS} dias e só funciona com a conta Google deste e-mail (${a.email}).`,
  ].join("\n");
  const html = [
    "<p>Olá!</p>",
    `<p><strong>${escapeHtml(inviterName)}</strong> convidou você para a família <strong>${escapeHtml(familyName)}</strong>.</p>`,
    `<p><a href="${escapeHtml(a.inviteUrl)}">Entrar na família</a></p>`,
    `<p>O convite vale por ${INVITATION_TTL_DAYS} dias e só funciona com a conta Google deste e-mail (${escapeHtml(a.email)}).</p>`,
  ].join("\n");
  return { subject, text, html };
}
