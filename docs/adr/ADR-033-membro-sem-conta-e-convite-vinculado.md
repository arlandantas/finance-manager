# ADR-033 — Membro sem conta (`Member.userId` anulável) e convite vinculado ao membro

**Status:** aceito (com condições da revisão de segurança SEC-058..068; D-GES-63) · **Data:** 2026-10-30 · **Autor:** arquiteto

## Contexto
NEED-028: um membro precisa existir antes (ou sem nunca) ter login, igual para adulto e criança, participar do acerto, ser cadastrado e convidado só pelo Administrador e, ao aceitar convite, **assumir** o mesmo vínculo sem duplicar nada. Hoje `Member.userId` é `NOT NULL` e o nome vem de `User.name`.

## Decisão
1. **`members.userId` anulável** (opção escolhida frente a entidade separada ou usuário "fantasma"): sem conta ⇔ `userId IS NULL`, estado ortogonal a ex-membro. FKs do ledger não mudam e o aceite é um `UPDATE members SET userId`.
2. Colunas: `name` (2..60), `pendingEmail` (opcional, só para o convite), `linkedAt`, `createdByMemberId`. **Nome exibido** = `memberDisplayName(m) = m.name ?? m.user?.name ?? localPart(email)`, função única para toda leitura de nome.
3. **Constraints:** sem conta exige `name`; sem conta ⇒ `role = 'MEMBER'`; `pendingEmail` só enquanto ativo e sem conta, único por família. **Gatilho `members_link_guard`:** `userId` só vai de `NULL` para não nulo, com `removedAt` nulo; no mesmo UPDATE `pendingEmail` vira `NULL` e `linkedAt` é preenchido; `joinedAt` e `familyId` imutáveis; comparações com `IS DISTINCT FROM`.
4. **Unicidade** de nome (sem caixa/acento, `NAME_TAKEN`) e de e-mail (`DUPLICATE_MEMBER`, `EMAIL_BELONGS_TO_OTHER_MEMBER`) checada no serviço sob `lockFamilyAdmins`. `nameKey` com NFKC, sem invisíveis/bidi; termos reservados do sistema ⇒ `NAME_RESERVED`.
5. **Nome:** o do Administrador é rótulo provisório; **no aceite a pessoa escolhe o próprio nome** (pré-preenchido com o do Google, nunca com o rótulo), gravado em `members.name` no mesmo UPDATE do vínculo. Depois só o próprio membro o altera; o Administrador nunca renomeia quem tem conta (`409 MEMBER_IS_LINKED`). Histórico guarda só `memberId` e resolve o nome na leitura.
6. **`Invitation.memberId`** com FK composta e índice único parcial por convite `PENDING`. Eventos `MEMBER_CREATED/UPDATED/LINKED` **nunca** gravam nome ou e-mail em `changes`; `INVITATION_RESENT` deixa de gravar e-mail (SEC-061).
7. **Convite vinculado:** `POST /members/{id}/invitations` (só ADMIN, corpo `{ email }`), e-mail igual ao `pendingEmail` (`INVITATION_EMAIL_MISMATCH`); convite comum para e-mail de cadastro ⇒ `EMAIL_BELONGS_TO_UNLINKED_MEMBER`. O e-mail e a página pública do convite não trazem nome nem contagens; a prévia (nome do cadastro e contagens, sem valores) só vai ao e-mail verificado do convite.
8. **Aceite** (`POST /me/invitations/{id}/accept`): advisory lock da família como primeiro passo, claim condicional do convite, `UPDATE members` com `userId IS NULL AND removedAt IS NULL` (0 linhas ⇒ `MEMBER_NO_LONGER_AVAILABLE`), nome escolhido checado antes, `MEMBER_LINKED`, aviso por e-mail aos Administradores. **Nada mais é escrito** (ledger, `version`s, saldos e acerto idênticos). Ex-membro com o mesmo e-mail pode assumir um cadastro novo; vínculos antigos não são fundidos.
9. **"Só meu" com dono sem conta:** o Administrador (tutor) edita, exclui, restaura e dá baixa; pode **criar** "Só meu" em nome do sem conta (exceção explícita, só na criação, só ADMIN, dono lido sob lock); **ninguém** pode tornar "Só meu" uma dividida paga pelo sem conta; pagador/responsável de/para sem conta só para terceiro, nunca para si (`UNLINKED_PAYER_FORBIDDEN`); titular sem conta só criado por Admin (`UNLINKED_OWNER_ADMIN_ONLY`). Após o aceite, o tutor perde esses poderes. Um único predicado `ownerStanding`.

## Consequências
- ~45 leituras de nome passam a `memberDisplayName`. Sessão/MCP/consentimento impossíveis para membro sem conta por construção.
- Excluir minha conta zera `members.name` ("Conta excluída"); removido sem nunca ter conta mantém o rótulo com "(ex-membro)".
- Fatias: 092a/b (modelo, cadastro), 093a/b (seletores, titular, acerto), 094a/b (convite, aceite), 095 (editar/remover).
