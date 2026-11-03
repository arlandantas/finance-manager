# ADR-012 — Convites por e-mail, vínculo no login e adapter de e-mail

**Status:** aceito (D-GES-07; ampliado pelo ADR-033) · **Data:** 2026-10 · **Autor:** arquiteto

## Contexto
Convites de membros por e-mail (validade 7 dias) com e-mail verificado como prova de identidade, sem depender de provedor fixo (EXT-02).

## Decisão
1. **Token:** 32 bytes aleatórios (`base64url`) no link `…/convite/<token>`; no banco só o **hash SHA-256**. O link **não concede acesso**: leva ao login; o vínculo ocorre **no login**, por e-mail verificado.
2. **Vínculo único e idempotente:** `acceptPendingInvitation(user)` roda no *gate* (primeira requisição autenticada de quem não tem `Member`), em transação, cobrindo com ou sem clique no link. `Member.userId` é `UNIQUE` (1 família por usuário no R1).
3. **Estados** `PENDING | ACCEPTED | CANCELED | EXPIRED`; expiração por `expiresAt` (`INVITATION_TTL_DAYS` = 7), marcação `EXPIRED` oportunista. Índice único parcial `(familyId, email) WHERE status = 'PENDING'`.
4. **E-mail por port/adapter:** `MailPort.send`; `SmtpMailer` (nodemailer, `SMTP_*`; Mailpit em dev) e `InMemoryMailer` em testes. Envio **após o commit**, timeout 5 s; falha **não desfaz o convite**: resposta traz `emailStatus: "FAILED"` e a UI oferece "Copiar link do convite".
5. Corpo em português (texto + HTML simples) com família, quem convidou, validade e link.

## Consequências
- Sem dependência externa; E2E leem a API do Mailpit.
