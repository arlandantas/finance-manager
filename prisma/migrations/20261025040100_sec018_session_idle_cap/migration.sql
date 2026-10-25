-- SEC-018 (SDD-028 §6.2, U2): ociosidade de 30 dias. Sessões existentes (até 90 dias de "expires") passam a
-- valer no máximo 30 dias a partir de agora; quem usa o app dentro desse prazo continua logado (renovação).
UPDATE "sessions" SET "expires" = LEAST("expires", now() + interval '30 days');
