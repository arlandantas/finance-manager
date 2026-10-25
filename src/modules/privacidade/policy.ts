import { SESSION_ABSOLUTE_SECONDS, SESSION_IDLE_SECONDS } from "@/lib/auth/session";
import {
  ENDED_SESSION_RETENTION_DAYS,
  IDEMPOTENCY_RETENTION_HOURS,
  INVITATION_RETENTION_DAYS,
} from "@/modules/cron/retention";
import { AI_RETENTION_MONTHS } from "@/modules/ia/purge";

// SEC-017e (SDD-028 §7.1/§7.6, US-082): texto da página "Privacidade". É um RASCUNHO do PO para o usuário
// aprovar (não é parecer jurídico). Os prazos saem das mesmas constantes que o expurgo usa, para o texto e o
// comportamento não se separarem.

export const POLICY_VERSION = 1;
/** Data da última atualização do texto (mudar junto com a versão). */
export const POLICY_UPDATED_ON = "2026-10-26";
/** Enquanto `true`, a página avisa que o texto aguarda aprovação. O usuário vira para `false` ao aprovar. */
export const POLICY_IS_DRAFT = true;
/** Mostrado enquanto `PRIVACY_CONTACT_EMAIL` não estiver definido. */
export const CONTACT_PLACEHOLDER = "[e-mail de contato a definir pelo usuário]";

export const AI_RETENTION_YEARS_TEXT = `${AI_RETENTION_MONTHS / 12} anos`;
const days = (s: number) => Math.round(s / 86_400);

export type RetentionRow = { dado: string; prazo: string };

export const RETENTION_ROWS: RetentionRow[] = [
  {
    dado: "Sessões (aparelhos conectados)",
    prazo: `Vencem após ${days(SESSION_IDLE_SECONDS)} dias sem uso ou ${days(SESSION_ABSOLUTE_SECONDS)} dias depois do login e são apagadas em até 1 dia. Sessões encerradas pela remoção da família somem em ${ENDED_SESSION_RETENTION_DAYS} dias.`,
  },
  { dado: "Códigos de acesso vencidos", prazo: "Apagados em até 1 dia." },
  {
    dado: "Convites encerrados ou vencidos",
    prazo: `Apagados ${INVITATION_RETENTION_DAYS} dias depois do encerramento.`,
  },
  {
    dado: "Registros técnicos de repetição de pedidos",
    prazo: `Apagados em ${IDEMPOTENCY_RETENTION_HOURS} horas.`,
  },
  {
    dado: "Uso e análises de IA",
    prazo: `Apagados após ${AI_RETENTION_YEARS_TEXT}. Você pode apagar as análises antes, na própria tela.`,
  },
  { dado: "Registro das conexões do assistente", prazo: "Guardado por 12 meses." },
  {
    dado: "Lançamentos e demais registros financeiros",
    prazo:
      "Ficam enquanto a família existir. Se você sair da família, o histórico que ajudou a registrar continua com ela. Se a última pessoa excluir a família, tudo é apagado de forma definitiva.",
  },
  {
    dado: "Nome, e-mail e foto",
    prazo:
      "Ficam enquanto a conta existir. Ao excluir a conta, são apagados e o seu nome vira “Conta excluída”.",
  },
];
