import { INVITATION_TTL_DAYS } from "@/modules/familia/invitations/constants";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** E-mail do convite (SDD-003 §5.3): puro e coberto por snapshot. Sem imagens externas. */
export function invitationEmail(a: {
  inviterName: string;
  familyName: string;
  inviteUrl: string;
  email: string;
}): { subject: string; text: string; html: string } {
  const subject = `${a.inviterName} convidou você para a ${a.familyName} no Finance Manager`;
  const text = [
    "Olá!",
    "",
    `${a.inviterName} convidou você para a família ${a.familyName}.`,
    "",
    `Para entrar, abra o link: ${a.inviteUrl}`,
    "",
    `O convite vale por ${INVITATION_TTL_DAYS} dias e só funciona com a conta Google deste e-mail (${a.email}).`,
  ].join("\n");
  const html = [
    "<p>Olá!</p>",
    `<p><strong>${escapeHtml(a.inviterName)}</strong> convidou você para a família <strong>${escapeHtml(a.familyName)}</strong>.</p>`,
    `<p><a href="${escapeHtml(a.inviteUrl)}">Entrar na família</a></p>`,
    `<p>O convite vale por ${INVITATION_TTL_DAYS} dias e só funciona com a conta Google deste e-mail (${escapeHtml(a.email)}).</p>`,
  ].join("\n");
  return { subject, text, html };
}
