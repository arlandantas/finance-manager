# ADR-038 — Membro sem conta: contrato do convite vinculado, do aceite e da edição

**Status:** aceito (detalha ADR-033 §6-8 e ADR-034) · **Data:** 2026-11-07 · **Autor:** arquiteto

## Contexto
US-094a/094b/095 implementam o que o ADR-033 decidiu em linhas gerais. Faltavam: onde mora o código (o `invitations/service.ts` já passa de 500 linhas), a chave da trava no aceite (o usuário ainda não é membro), o corpo do aceite, o que é "lançamento" nas contagens da prévia e o que acontece com convites antigos ao trocar o e-mail.

## Decisão
1. **Código novo em arquivos novos:** `familia/invitations/linked.ts` (convite vinculado), `familia/invitations/accept-linked.ts` (prévia e aceite vinculado), `familia/member-profile.ts` (edição do sem conta). `service.ts` só delega (nenhuma linha líquida a mais).
2. **Trava do aceite:** `pg_advisory_xact_lock(hashtextextended('family:' || familyId, 0))`, a MESMA chave de `lockFamilyAdmins`, sem a checagem de ator (o aceitante ainda não é membro). É a primeira instrução da transação; o aceite não escreve nada financeiro, então não toma `lockFamilySplit`.
3. **Corpo do aceite:** `{ token?: string, name?: string }` `.strict()`. `name` é obrigatório quando `inv.memberId` existe (ausente => 422 `NAME_REQUIRED`) e ignorado no convite comum. Saneado e validado como no cadastro (`sanitizeMemberName`, `nameKey`, reservados, unicidade excluindo o próprio cadastro).
4. **Contagens da prévia** (só ao e-mail verificado do convite): contas e cartões ativos com o cadastro como titular, lançamentos ativos `EXPENSE/INCOME` com `payerMemberId` = cadastro, previstas `PREVISTO` com o cadastro como responsável. Nunca valores, descrições nem nomes de terceiros.
5. **Edição do sem conta:** rota própria `PATCH /members/{id}/profile` `{ name?, email?: string | null }` `.strict()` (o `PATCH /members/{id}` de papel não muda). Só ADMIN, sob `lockFamilyAdmins`; membro com conta => 409 `MEMBER_IS_LINKED`. Trocar ou remover o e-mail anonimiza (`deleted+<memberId>@invalid.local`) os convites ENCERRADOS do cadastro e limpa idempotência que cite o e-mail antigo (mesmo helper da remoção).
6. **Selo** do cadastro: `pendingInvitation: { id, expiresAt } | null` no `MemberDTO` só para ADMIN (convite vinculado `PENDING` não vencido); vencido conta como sem convite.

## Consequências
- Remover um sem conta (já entregue na US-093a) segue sendo o único caminho de remoção; US-095 não reimplementa.
- Convite vinculado consome as mesmas cotas de família e de pessoa que o convite comum (envia e-mail).
