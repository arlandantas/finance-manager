# ADR-012: Convites por e-mail, vínculo no login e adapter de e-mail

## Status
Aceito (Tech Lead). Implementa a **D-GES-07** (validade 7 dias) e o EXT-02.

## Decisão
1. **Token do convite:** 32 bytes aleatórios (`base64url`) enviados no link `…/convite/<token>`; no banco só o **hash SHA-256**. O link **não concede acesso**: serve para levar a pessoa ao login e exibir o contexto do convite. O vínculo ocorre **no login**, por e-mail verificado (RN-012.2).
2. **Vínculo único e idempotente:** a função `acceptPendingInvitation(user)` roda no *gate* do app (primeira requisição autenticada de quem não tem `Member`), em transação, e cobre os dois caminhos (com ou sem clicar no link). `Member.userId` é `UNIQUE` (R1: 1 família por usuário).
3. **Estados:** `PENDING | ACCEPTED | CANCELED | EXPIRED`. Expiração é avaliada por `expiresAt` (7 dias, em `INVITATION_TTL_DAYS`); a marcação `EXPIRED` é oportunista. Índice único parcial `(familyId, email) WHERE status = 'PENDING'`.
4. **E-mail por *port/adapter*:** `MailPort.send(message)`; adapter `SmtpMailer` (nodemailer) para `SMTP_HOST:SMTP_PORT` (Mailpit em dev); adapter `InMemoryMailer` em testes unitários. Trocar de provedor (EXT-02) é só configurar `SMTP_*`. Envio **após o commit**, com timeout de 5 s; falha **não desfaz o convite**: a resposta traz `emailStatus: "FAILED"` e a UI oferece "Copiar link do convite" (seguro porque o vínculo exige o e-mail).
5. Corpo do e-mail em português, texto + HTML simples, com nome da família, quem convidou, validade e o link.

## Consequências
Sem dependência externa; testes de e-mail leem a API do Mailpit (`GET :8025/api/v1/messages`) nos E2E.
