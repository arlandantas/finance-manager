# Reteste final das rodadas 3 e 4 de segurança — 2026-10-25

**Autor:** Agente de Segurança da Informação · **Tipo:** reteste + busca de bypass e regressões
**Código analisado:** `b494e0c`..`849008c` (rodada 3: SEC-025/026/027/014/028/022 e us-016a; rodada 4: SEC-029..034/036/037), referências D-GES-45..47.
**Ambiente:** `next dev` próprio em `127.0.0.1:3190` (`NEXT_DIST_DIR=.next-sec`) contra o banco **descartável** `finance_sec_final` no `db-test` (porta 5443), com login de teste, `MCP_ENABLED=true`, CIMD de teste gravado em cache no próprio banco (sem rede) e LLM simulado. As suítes de integração rodaram em `finance_sec_final2`. **Os dois bancos foram apagados** (`DROP DATABASE … WITH (FORCE)`). Produção, banco DEV, Google, claude.ai e Anthropic não foram tocados. Dados só de teste (`*@sec.test`).

---

## 1. Resumo executivo

| Resultado | Qtde | IDs |
| :-- | :-: | :-- |
| **Corrigido** | 14 | SEC-014¹, 022, 025², 027, 028, 029, 030, 031³, 032, 033, 034, 036, 037⁴, us-016a |
| **Parcial** | 1 | SEC-026 (o bypass está na SEC-038) |
| **Não corrigido** | 0 | — |
| **Achados novos** | 4 | SEC-038 (Baixa), SEC-039 (Baixa), SEC-040 (Info), SEC-041 (Info) |
| **Regressões em achados antigos** | 0 | varredura na §4 |

¹ No escopo decidido no D-GES-47: o assunto não leva mais o nome da família. O nome livre do convidante continua no assunto (ratificado). Ver SEC-040.
² A reprodução original dá 403 nos dois caminhos. Os residuais aceitos pela regra ratificada estão na §5.
³ Não sobra resíduo. Mas o modo de limpar abriu a regressão **SEC-039**.
⁴ Vale para o e-mail de aviso. A reautenticação continua como pergunta ao usuário.

**Visão geral.** As correções resistiram aos vetores pedidos:
- O "Só meu" de outro não é mais criado, entregue, editado, excluído, pago nem estornado, seja pela API, no cartão, no parcelado, nas previstas ou nas séries. O MCP não aceita pagador e sempre lança em nome do dono do token.
- O limite de convites ficou atômico.
- O `/token` não barra mais a troca legítima, nem do mesmo IP.
- Uma conta excluída não autentica por nenhum caminho testado: sessão antiga, segundo aparelho, login de teste com 4 variantes de e-mail, MCP e refresh OAuth.
- A exportação com 33,5 mil lançamentos funcionou.
- As travas têm `search_path` fixo, e a GUC de anonimização ficou escopada.
- O novo lock do cartão não gerou deadlock nem 500.

Suítes de integração de segurança e correlatas: **28 arquivos, 359/359**.

**Top riscos restantes:**
1. **SEC-038 (Baixa):** a regra do D-GES-45 tem um furo nas **previstas e séries recorrentes**. Um membro "captura" a prevista dividida de outro: num único `PATCH`, põe a si mesmo como responsável e a torna "Só meu". Depois disso o responsável original recebe 403 ao editar, excluir ou dar baixa. É a SEC-025 reaparecendo por outra rota.
2. **SEC-039 (Baixa, regressão da SEC-031):** ao excluir uma conta ou família, o sistema apaga respostas de idempotência de **qualquer família** cujo texto contenha o nome da pessoa ou da família, mesmo como parte de outra palavra, a partir de 3 caracteres. Isso tira a proteção contra lançamento duplicado de terceiros que repetem uma requisição.

### Perguntas ao usuário (via Gestor)
1. **SEC-038:** nas previstas e séries vale a mesma regra das despesas? Isto é, só o responsável atual (ou o autor) pode se colocar como responsável e tornar "Só meu". Recomendação: sim.
2. **§5 residuais:** aceitar que o **dono da conta** fique sem ação sobre um "Só meu" de outra pessoa lançado na conta dele? Isso acontece quando outra pessoa lança na conta dele ou quando o autor assume o pagamento. Hoje a regra só olha o pagador.
3. **SEC-040:** o limite de convites deve ser por pessoa (além de por família) e contar os reenvios?

---

## 2. Tabela por SEC

| SEC | Status | Evidência (reprodução local) | Bypass / observações |
| :-- | :-- | :-- | :-- |
| SEC-025 | **Corrigido** | Despesa dividida de A na conta de A. C faz `PATCH {isSharedExpense:false, payerMemberId:C}` ⇒ 403 `PERSONAL_OWNER_ONLY`. `PATCH {payerMemberId:C}` (passo 1 do caminho em dois `PATCH`) ⇒ 403. `PATCH {isSharedExpense:false}` ⇒ 403. | Residuais da regra ratificada (§5): (a) se C é o **autor** da dividida paga por A na conta de A, C assume o pagador e torna "Só meu" (200), e A recebe 403 no lançamento da própria conta; (b) C põe um **terceiro** B como pagador (200) e B torna "Só meu" (200), ou seja, dois membros juntos contornam a regra; (c) C lança "Só meu" próprio na conta de A (201), e A não exclui (403). |
| SEC-026 | **Parcial** | (a) C edita e exclui a prevista "Só meu" de A ⇒ 403. (b) C dá baixa nela ⇒ 403. C estorna a baixa feita por A ⇒ 403. A dá baixa no próprio "Só meu" com pagador C ⇒ 403 `PERSONAL_ON_BEHALF_FORBIDDEN`. (c) C cria "Só meu" com pagador A na conta de A, na conta de C, no cartão e parcelado em 3x ⇒ 403 em todos. C entrega o próprio "Só meu" para A ⇒ 403. C cria prevista ou série "Só meu" com responsável A ⇒ 403. C edita ou encerra a série "Só meu" de A ⇒ 403. MCP `lancar_despesa`: sem campo de pagador e com `isSharedExpense:false` fixo, ou seja, sempre em nome do dono do token (código + suíte `us076`). | **Bypass SEC-038:** C captura a prevista ou série **dividida** de A num `PATCH` (`responsibleMemberId:C, isSharedExpense:false` ⇒ 200). Depois disso A recebe 403 ao editar, excluir e dar baixa. |
| SEC-027 | **Corrigido** | 30 `POST /invitations` em paralelo ⇒ 5×201 e 25×429. A base ficou com 5 convites. Um convite cancelado continua contando (429 depois de cancelar). | Contornável por outro caminho: ver SEC-040. |
| SEC-014 | **Corrigido** (escopo D-GES-47) | Assunto no Mailpit: "Nome Livre Quebra Muito Longo Para Assunto De Email Phishin… convidou você para o Finance Manager". O nome da família saiu. `U+202E` e quebra de linha viraram espaço, e o texto foi cortado em 60 caracteres. | O nome do convidante (perfil Google) continua livre no assunto. Reenvios (3 por convite) não contam no limite. Ver SEC-040. |
| SEC-028 | **Corrigido** | Com o código interceptado, 132 trocas com verificador errado vindas de 12 IPs ⇒ 120×400 e 12×429. Depois, a troca legítima de outro IP ⇒ 200. Com 11 falhas do **mesmo** IP, a legítima também ⇒ 200. | Efeito colateral: o balde de falhas não freia nada (SEC-041). |
| SEC-005 (rel.) | Sem mudança | 40 refresh do mesmo IP ⇒ 30×400 e 10×429. 60 refresh com `x-real-ip` forjado e rotativo ⇒ 60×400, sem 429. | Como antes: depende de a Vercel sobrescrever o cabeçalho. Não verificado. |
| SEC-022 | **Corrigido** | Visão pública: `{"status":"ok","timestamp":…}`, sem `checks`. Com Bearer errado, a resposta é a mesma da pública. Com o Bearer certo vem o detalhe (`checks.database`). | — |
| SEC-029 | **Corrigido** | Bob lança uma dividida com pagador Alice, e Alice a torna "Só meu" com observação. A exportação do Bob ativo não traz a observação. Bob sai da família e exporta de novo: não vem a observação e `familiasAnteriores[0].lancamentos` = 0. | — |
| SEC-030 | **Corrigido** | Depois de excluir a conta: a sessão 1 e a sessão 2 (outro aparelho) dão 401 em `/me`. `/api/auth/session` ⇒ `null`. `/me/export` ⇒ 401. A página `/extrato` ⇒ 307 para o login. Login de teste com `deleted+<id>@invalid.local`, maiúsculas, espaços e `@INVALID.local` ⇒ 403 `ACCOUNT_DELETED`. O e-mail original cria um id **novo**. Access token MCP ⇒ 401. Refresh OAuth ⇒ `invalid_grant`. Uma sessão do usuário excluído inserida direto no banco ⇒ 401, e a linha foi apagada. | Login Google real não testado. |
| SEC-031 | **Corrigido** (com regressão) | Depois das exclusões de conta e de família, a varredura em `idempotency_records` não acha o e-mail do titular nem o nome das famílias excluídas. As únicas ocorrências restantes eram de uma família que ainda existe (esperado). Suíte `sec031` passou. | **Regressão SEC-039:** a limpeza é feita por trecho de texto e alcança todas as famílias. |
| SEC-032 | **Corrigido** | Família com **33.502** lançamentos: exportação ⇒ 200, 20,3 MB, 0,7–0,9 s. A 4ª exportação no dia ⇒ 429. | O arquivo continua montado em memória (stream real no backlog do TL): RSS subiu de 1,14 para 1,53 GB em três exportações seguidas. A devolução da cota no 413/5xx foi verificada só pela suíte, não ao vivo. |
| SEC-033 | **Corrigido** | `exMembers` traz `deleted:true` para a conta excluída. `memberLabel`/`memberName` decidem pelo `deleted`, não pelo nome (código + suíte `sec030-033`). | — |
| SEC-034 | **Corrigido** | `?deleted=Conta invadida…` e `?left=Banco X` ⇒ o texto não aparece na tela; só o *payload* RSC do Next repete a URL. `?deleted=1` ⇒ "Família excluída". `?left=1` ⇒ "Você saiu da família". | — |
| SEC-036 | **Corrigido** | As 8 funções de `public` têm `search_path=pg_catalog, public`. Testes em psql: sem GUC ⇒ bloqueado; `anonymize_user='on'` (valor antigo) ⇒ bloqueado; e-mail diferente do anonimizado ⇒ bloqueado; trocar outro campo junto ⇒ bloqueado; só o e-mail certo ⇒ passa (por desenho). `current_setting` sombra num schema `evil` com `search_path` malicioso ⇒ a trava continua valendo. `purge_family` com outra família ⇒ bloqueado. A GUC não vaza depois do `COMMIT`. | Local: a role `finance` é dona das tabelas e superusuária. Em produção não foi verificado. |
| SEC-037 | **Corrigido** (aviso) | Excluir a família ⇒ e-mail "Sua família foi excluída" no Mailpit, para o próprio Administrador (4 de 4). O aviso de conta excluída foi verificado pela suíte `sec037`. | A reautenticação segue em aberto (pergunta ao usuário). |
| us-016a | **Corrigido** | 25 corridas compra × `PATCH` do ciclo num cartão novo, com atrasos variados: 7 com a compra vencendo e 18 com o `PATCH` vencendo, **todas coerentes** (`closingDay` do cartão = dia de fechamento da 1ª fatura). 3 rodadas de 45 requisições paralelas em 2 cartões (à vista, parceladas, divididas e `PATCH`) ⇒ nenhum 500, **0 deadlock** no log do app e do Postgres, de 0,9 a 1,1 s por rodada. | Os 422 `INSTALLMENT_SPLIT_UNAVAILABLE` e `CYCLE_LOCKED` são regras de negócio esperadas. |

---

## 3. Achados novos

### SEC-038 — Prevista ou série dividida "capturada" como "Só meu" por quem não é o responsável · **Baixa** · Confirmado
- **Local:** `src/modules/previstas/service.ts:238-242` (`updatePlannedExpense`) e `src/modules/previstas/recurring-service.ts:249-253` (`updateSeries`). `assertCanWritePlanned` deixa passar porque a linha atual é dividida, e `assertPlannedResultAllowed` só confere o **resultado** (responsável = quem age).
- **Descrição e impacto:** é o equivalente da SEC-025 nas previstas. C (MEMBER) troca o responsável da prevista ou série **dividida** de A para si e a marca "Só meu" num único `PATCH`. A partir daí, A recebe 403 `PERSONAL_OWNER_ONLY` ao editar, excluir ou dar baixa, e a despesa sai do rateio. Nas séries o efeito vale para os meses gerados. Viola a decisão do D-GES-45: só o dono torna "Só meu", e a regra inclui as previstas.
- **Como explorar (reproduzido):** A cria `POST /planned-expenses {isSharedExpense:true}`. C faz `PATCH /planned-expenses/{id} {version, isSharedExpense:false, responsibleMemberId:C}` ⇒ 200. Depois: A `PATCH` ⇒ 403, A `delete` ⇒ 403, A `pay` ⇒ 403. O mesmo vale para `PATCH /recurring-expenses/{id}` ⇒ 200.
- **Correção sugerida (Dev):** aplicar às previstas e séries a mesma regra de `assertCanMakePersonal`. Quem não é o responsável atual nem o autor não pode se pôr como responsável de uma prevista dividida, nem torná-la "Só meu". Testes de integração nos dois serviços.
- **Status:** Aberto · **Rastreio:** SEC-025, SEC-026, D-GES-45, US-018, US-058/059.

### SEC-039 — Limpeza da SEC-031 apaga respostas de idempotência de outras famílias por trecho de nome · **Baixa** · Confirmado por leitura de código
- **Local:** `src/modules/privacidade/delete-account.ts:36-43` (`scrubIdempotencyMentioning`, chamado com `user.name`), `src/modules/privacidade/delete-family.ts:75` (com `family.name`).
- **Descrição e impacto:** a limpeza apaga, em **todas as famílias**, as respostas guardadas (`responseStatus <> 0`) cujo texto contenha o nome digitado da pessoa ou da família, sem diferenciar caixa e a partir de 3 caracteres.
  - Um nome comum como "Ana" apaga respostas que citam "Mariana" ou "banana" em famílias sem relação nenhuma.
  - Um nome de família escolhido de propósito com trechos que aparecem em quase todo corpo de resposta pode esvaziar a tabela inteira. Isso exige criar uma família só e excluí-la.
  - Efeito: quem tinha uma requisição concluída e a repete com a mesma `Idempotency-Key`, por exemplo depois de uma falha de rede, vê a ação **executada de novo**. Isso pode gerar lançamento duplicado em outra família.
  - Não vaza dado e precisa de uma repetição na janela de 24 h, por isso a severidade é Baixa. Não explorei de forma dinâmica.
- **Correção sugerida (Dev/TL):** limitar a limpeza às linhas dos membros e ex-membros da família excluída e às que citam **identificadores** (UUID do titular, dos membros e da família, e o e-mail completo). Não procurar pelo nome livre em todas as famílias. Se o nome for necessário, casar só no valor exato dos campos `name`. Adicionar teste: uma resposta de outra família com o nome do titular dentro de outra palavra continua lá.
- **Status:** Aberto · **Rastreio:** SEC-031, D-GES-46 P2, SDD-028 §7.4/§7.5.

### SEC-040 — Limite de convites é por família e pode ser contornado excluindo e recriando a família · **Informativa** · Confirmado
- **Local:** `src/modules/familia/invitations/service.ts:118-129` (cota por `familyId`).
- **Descrição e impacto:** um mesmo usuário criou e excluiu a família 4 vezes e enviou **20 convites** em segundos, para um limite de 5 por hora. Os reenvios (3 por convite) também não contam. O assunto leva o nome livre do convidante (até 60 caracteres, ratificado), que pode servir de isca. Mitigado em produção pela lista de cadastro (U6): o atacante precisa ser uma conta permitida.
- **Correção sugerida (Dev):** limitar também por usuário convidante (`hit()` em `mcp_rate_buckets`) e contar os reenvios.
- **Status:** Aberto · **Rastreio:** SEC-014, SEC-027, US-003/039.

### SEC-041 — O balde de falhas do `/token` não freia tentativas · **Informativa** · Confirmado
- **Local:** `src/modules/mcp/token-endpoint.ts:64-100`.
- **Descrição e impacto:** a validação roda **antes** do balde, então uma tentativa certa depois do limite ainda recebe 200. Só muda a resposta das erradas, de 400 para 429. Além disso, a chave inclui o próprio segredo, então quem testa segredos diferentes nunca atinge o balde. O único freio real é o limite de 30 por minuto por IP e `client_id`, forjável fora da Vercel. O risco é desprezível, porque código, refresh e verificador PKCE têm 256 bits, mas o comentário "freio à adivinhação" superestima a proteção.
- **Correção sugerida (Dev, opcional):** consultar o balde antes de validar, sem consumir, e recusar com 429 quando ele estiver esgotado, mesmo que a tentativa estivesse certa. Isso vale só para o mesmo IP, então não reabre a SEC-028. Ou corrigir o comentário.
- **Status:** Aberto · **Rastreio:** SEC-005, SEC-023, SEC-028.

---

## 4. Varredura de regressões (achados anteriores)
- **SEC-002:** `/_next/image` ⇒ 404. `pnpm audit --prod`: 11 avisos, todos transitivos e os mesmos do reteste anterior (SEC-019).
- **SEC-003:** `callbackUrl` com `//evil`, `/%5C`, `https://`, `/\` e `javascript:` ⇒ `307 /`.
- **SEC-004:** um terceiro aceitando convite alheio ⇒ 404.
- **SEC-006:** `X-Frame-Options DENY` e `nosniff` presentes. CSP presente; a de scripts continua em Report-Only (como antes).
- **SEC-007:** corpo de 300 KB ⇒ 413.
- **CSRF:** `POST` com `Origin` estranho ⇒ 403. Nenhuma resposta CORS.
- **SEC-020:** 320 `GET /me` ⇒ 297×200 e 23×429.
- **Logs do servidor:** nenhum e-mail, observação ou nome de teste apareceu.
- **Suítes:** `sec009`..`sec037`, `us-003`, `us-016a`, `us-018`, `us-019`, `us-030`, `us-035`, `us-039`, `us-058`, `us076`, `en006a`, `health` e `u6` ⇒ **359/359**.

Nenhuma regressão encontrada.

## 5. Riscos residuais aceitos (pela regra ratificada ou por decisão anterior)
- **Autor de dividida assume o pagamento** (DEV-106..110 ratificado): o autor C de uma dividida paga por A na conta de A assume o pagador e a torna "Só meu". A então não altera um lançamento da própria conta.
- **"Só meu" na conta de outra pessoa:** a regra olha o pagador, não o dono da conta (pergunta 2).
- **Dois membros juntos:** C põe B como pagador de uma dividida de A, e B a torna "Só meu". Requer conluio; o histórico de revisões registra tudo.
- **SEC-011:** condicionada à homologação com o claude.ai (D-GES-45).
- **SEC-035:** aceito (D-GES-46).
- **SEC-001, 008, 015, 016:** D-GES-40.
- **Exportação em memória** (stream real no backlog do TL, teto de 50 MB).
- **Limite por IP forjável fora da Vercel** (SEC-005).
- **SEC-018 fase 2** pendente.
- **SEC-019** (transitivas sem correção).

## 6. O que não foi possível verificar
- **Vercel/produção:** sobrescrita de `x-real-ip`; se a role do Prisma Postgres é dona das tabelas (SEC-036); memória da função com exportações simultâneas perto do teto; aplicação da migração `20261027030000` em produção.
- **Google real:** login com o e-mail original depois da exclusão. Só verificado pelo login de teste, que cria um id novo.
- **claude.ai real e Claude com injeção:** fora do alcance permitido. `lancar_despesa` foi verificado por código e pela suíte `us076`, sem cliente MCP real.
- **Devolução da cota no 413 e no 5xx da exportação:** verificada só pela suíte, porque o teto é lido do ambiente do servidor e não o reiniciei com outro valor.
- **SEC-039:** verificada por leitura de código, sem exploração dinâmica.

## 7. Método e efeitos colaterais
- Revisão de `git diff b494e0c~1..849008c` em `src/` e `prisma/`.
- Scripts de prova (Node `fetch` + `psql`) só no *scratchpad*, não versionados.
- Carga de 33,5 mil lançamentos inserida por SQL no banco descartável.
- Efeitos desfeitos:
  - o `next dev` reescreveu `tsconfig.json` e `AGENTS.md`, e os dois foram revertidos com `git checkout --`;
  - `.next-sec/` foi apagada;
  - `finance_sec_final` e `finance_sec_final2` foram apagados.
- E-mails de teste (`*@sec.test`) ficaram no Mailpit local compartilhado.
- Sem commit (regra da tarefa).
