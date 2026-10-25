-- DEV-91 (US-035, SDD-028 §6.2): a remoção de um membro encerra as sessões dele. A linha fica marcada
-- (endedAt) para o aviso único "acesso encerrado"; ela não autentica mais.
ALTER TABLE "sessions" ADD COLUMN "endedAt" TIMESTAMPTZ(3);
