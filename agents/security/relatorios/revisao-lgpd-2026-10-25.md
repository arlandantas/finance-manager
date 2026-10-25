# Revisão de segurança dedicada: direitos do titular (SEC-017a..e)

**Data:** 2026-10-25 · **Autor:** Agente de Segurança da Informação · **Pedido:** Gestor (D-GES-45, "revisão de segurança dedicada das rotas de exportação/exclusão antes de liberar ao usuário")
**Código analisado:** `3fc271d`..`41b8d9f` (SEC-017b `GET /api/v1/me/export`, 017c `POST /api/v1/me/delete-account` e telas, 017d `POST /api/v1/family/delete` e migração `sec017_forbid_mutation_purge_bypass`, 017e `/privacidade`), mais o que esse código usa (`withApi`, `hit`, `findSessionUser`, `createDevSession`, `removeMember`, `memberLabel`). O expurgo 017a foi retestado em `reteste-2026-10-25.md` e aqui só entrou no que toca às exclusões.
**Ambiente:** `next dev` próprio em `127.0.0.1:3190` (`NEXT_DIST_DIR=.next-sec`) contra o banco **descartável** `finance_sec_lgpd` no contêiner `db-test` (porta 5443), com login de teste, `MCP_ENABLED=true` e LLM simulado. As suítes de integração `sec017*` (4 arquivos, **50/50 passando**) rodaram num segundo banco descartável `finance_sec_lgpd2`. **Os dois bancos foram apagados** (`DROP DATABASE … WITH (FORCE)`). Produção, banco DEV, Google, claude.ai e Anthropic não foram tocados. Dados só de teste (`*@sec.test`).
**Observação:** durante a sessão a árvore de trabalho tinha mudanças do Dev ainda não commitadas (rodada 3: `ownership.ts`, previstas, OAuth). O servidor local rodou com elas; nenhum achado abaixo depende delas.

---

## 1. Resumo executivo

O núcleo está bem feito. Não achei IDOR/BOLA: as três rotas tiram usuário, família e papel **só da sessão**, os corpos são `.strict()` (campo `familyId`/`userId` extra ⇒ 400) e a comparação de nome/e-mail é feita contra a própria conta/família. A exceção às travas (`app.purge_family`) está bem escopada: vale só para `DELETE`, só para linhas com `familyId` igual ao valor, só na transação. Testei sem variável, com outra família e com o UUID em maiúsculas, e as três tentativas falharam. CSRF, o bloqueio de papel e de "último Administrador/único membro" e a concorrência (5 exclusões de conta em paralelo, aceite de convite em corrida com a exclusão da família) se comportaram certo.

Os achados são de **privacidade residual** e de **robustez**:

| Severidade | Qtde | IDs |
| :-- | :-: | :-- |
| Crítica | 0 | |
| Alta | 0 | |
| Média | 0 | |
| Baixa | 4 | SEC-029, SEC-030, SEC-031, SEC-032 |
| Informativa | 5 | SEC-033, SEC-034, SEC-035, SEC-036, SEC-037 |

**Top riscos**
1. **SEC-029:** o arquivo de um **ex-membro** leva o "Só meu" de outra pessoa, se foi ele quem cadastrou o lançamento. Também leva a observação que a dona escreveu depois. O filtro da DEV-101 só vale para o membro ativo.
2. **SEC-030:** a linha da conta excluída **continua utilizável**. `deletedAt` não é checado na sessão nem no login de teste. Com o login de teste/homologação, `deleted+<id>@invalid.local` "ressuscita" a conta, exporta o histórico antigo e troca o nome que aparece no histórico da família.
3. **SEC-031:** o PII e os dados financeiros apagados ficam até cerca de 24 h em `idempotency_records.responseBody` de **outros** usuários (e do próprio, no caso da família). Os testes de "nada sobrou" não olham tabelas sem `familyId`.
4. **SEC-032:** a exportação dá **500** com mais de cerca de 32,7 mil lançamentos, bem abaixo do teto de 50 MB. Assim o titular fica sem o direito de acesso, a falha consome a cota de 3 por dia e o `413` prometido nunca chega. O arquivo é montado inteiro na memória (+~400 MB de RSS para 30 MB), sem o *stream* do SDD.

**Perguntas ao usuário (via Gestor)**
- P1 (SEC-029): o ex-membro deve receber os lançamentos que **ele cadastrou** e que hoje são "Só meu" de outra pessoa? Sugiro aplicar a mesma regra do membro ativo: fica fora.
- P2 (SEC-031): uma janela de até 24 h + o intervalo do *cron* é aceitável para "exclusão definitiva", ou a exclusão deve apagar na hora as respostas de idempotência que citam a família ou a pessoa?
- P3 (SEC-037): para ações irreversíveis basta digitar o e-mail ou o nome, ou exigimos um login recente (reautenticação no Google) e um aviso por e-mail?

---

## 2. Achados

### SEC-029 — Exportação do ex-membro inclui "Só meu" de outra pessoa cadastrado por ele
- **Severidade:** Baixa · **Situação da prova:** **Confirmado** (reproduzido localmente)
- **Local:** `src/modules/privacidade/export.ts:190-209` (`formerFamily` usa `loadTransactions(tx, familyId, mine)` sem o filtro `visibleToMe` da linha 83)
- **Descrição e impacto:** para o membro ativo, a DEV-101 tira do arquivo o "Só meu" de outra pessoa (ratificado no D-GES-45). No caminho do **ex-membro**, o filtro é "autor **ou** pagador sou eu". Se o ex-membro cadastrou uma despesa que hoje é "Só meu" de outro membro, ela sai inteira no arquivo dele: valor, descrição, categoria e a **observação atual**, inclusive o que a dona escreveu depois que ela virou "Só meu". Isso acontece, por exemplo, quando ele lançou uma despesa dividida paga por outra pessoa e essa pessoa a tornou "Só meu" (caminho permitido pela SEC-025/D-GES-45), ou com dados legados de "Só meu em nome de outro" (SEC-026). Resultado: o ex-membro recebe **mais** do que recebia quando ativo, e isso depois de ter saído.
- **Como explorar (local):** Alice (Admin) e Bob na Família A. Bob lança uma despesa **dividida** com `payerMemberId = Alice`. Alice faz `PATCH` com `isSharedExpense:false, note:"ALICEPRIV-NOTE consulta medica"`. Bob, ainda ativo, exporta: `ALICEPRIV` **não** aparece (correto). Bob sai da família (`POST /family/leave`) e exporta de novo: o lançamento aparece em `familiasAnteriores[0].lancamentos` com `"observacao":"ALICEPRIV-NOTE consulta medica"`, `"dividida":false` e `"pagadorId"` = Alice.
- **Correção sugerida (Dev):** aplicar em `formerFamily` o mesmo predicado `!isPersonalExpense(t) || mine.has(personalOwnerId(t))`. Teste de regressão: o ex-membro autor de um "Só meu" alheio não o recebe. Depois de P1, o TL registra a regra no SDD-028 §7.3.
- **Status:** Aberto · **Rastreio:** SEC-017b, US-079, SDD-028 §7.3, DEV-101, D-GES-45, SEC-025/026

### SEC-030 — Conta excluída continua autenticável e reaproveitável (anonimização reversível na prática)
- **Severidade:** Baixa · **Situação da prova:** **Confirmado** com o login de teste. Pelo Google: não explorável (o Google não emite `@invalid.local`).
- **Local:** `src/lib/auth/session.ts:64-93` (`findSessionUser` não olha `user.deletedAt`); `src/lib/auth/dev-login.ts:14-23` (`createDevSession` encontra o usuário pelo e-mail anonimizado, cria sessão e **regrava `name`**); `src/lib/deleted-account.ts:7` (o rótulo depende do nome)
- **Descrição e impacto:** a anonimização troca o e-mail por `deleted+<userId>@invalid.local`, mas a linha segue ligada a `members`, `transactions` e `family_events` e nada impede que alguém volte a entrar nela. Com o login de teste (dev ou o modo de homologação da ADR-024), basta saber o `userId`, e o próprio titular sabe o seu. O efeito:
  - (a) volta a ter conta ativa;
  - (b) `GET /me/export` devolve as famílias anteriores com os lançamentos que a pessoa fez ou pagou, e o titular "excluído" leva esses dados mesmo depois da exclusão;
  - (c) o nome volta a ser gravado (no teste, "Zumbi"), e as telas e o MCP deixam de mostrar "ex-membro (conta excluída)" e passam a mostrar o nome novo no histórico da família.

  O `userId` não aparece nos DTOs de outros membros (procurei), então um terceiro não acha o alvo com facilidade. Qualquer caminho futuro que reaproveite o usuário pelo e-mail ou pelo id (outro provedor, ligação de conta, importação) herdaria o mesmo defeito.
- **Como explorar (local):** depois de Bob excluir a conta, `POST /api/dev/login {"email":"deleted+<idDoBob>@invalid.local","name":"Zumbi"}` ⇒ 200. `GET /api/v1/me` traz o id antigo. `GET /api/v1/me/export` ⇒ 200, com `vinculos` da Família A e os lançamentos antigos (`BOBPRIV…`). Em `users`: `name = 'Zumbi'` e `deletedAt` preenchido.
- **Correção sugerida (Dev):** `findSessionUser` recusa usuário com `deletedAt` (e apaga a sessão). `createDevSession` e o adaptador do Auth.js recusam ou ignoram usuários com `deletedAt` (ou rejeitam o domínio `invalid.local`). O rótulo "conta excluída" passa a usar `deletedAt` em vez do nome (ver SEC-033). Testes: login de teste no e-mail anonimizado ⇒ recusa; sessão de usuário excluído ⇒ 401.
- **Status:** Aberto · **Rastreio:** SEC-017c, US-080, SDD-028 §7.4, ADR-024, ADR-008

### SEC-031 — Dados excluídos sobrevivem em `idempotency_records` de outros usuários (até ~24 h)
- **Severidade:** Baixa · **Situação da prova:** **Confirmado** (varredura SQL em todas as colunas textuais/JSON do banco de teste)
- **Local:** `src/modules/privacidade/delete-account.ts` (`scrubIdempotency` só apaga as linhas do **titular**); `src/modules/privacidade/delete-family.ts` (`FAMILY_TABLES_DELETE_ORDER` só cobre tabelas com `familyId`); `src/lib/api/with-api.ts` (`saveIdempotentResponse` guarda o corpo da resposta inteiro)
- **Descrição e impacto:** cada POST/PATCH idempotente guarda a **resposta completa** (nome, e-mail, observações, nomes de contas) em `idempotency_records`, por usuário, por 24 h (o *cron* da 017a apaga depois disso). Encontrei dois casos:
  - **Exclusão de conta:** sobram o e-mail e o nome do titular nas respostas guardadas para **outros** membros. Exemplo: o `POST /invitations` da Alice guarda `"email":"bob@sec.test"`, e o `PATCH /transactions/…` guarda `"author":{"name":"Bob Teste"}`.
  - **Exclusão da família:** depois do `count = 0` em todas as tabelas com `familyId`, a varredura achou o id e o nome da família, os ids de membros, o nome "Conta Alice" e a observação "Só meu" `ALICEPRIV-NOTE consulta medica` em `idempotency_records.responseBody`. A própria resposta da exclusão (`familyName`) também fica guardada.

  O risco é limitado: dura cerca de 24 h, só o dono da linha reproduz a resposta e só com a mesma chave. Mas fica dentro de uma cópia de banco e de backups, e contradiz o "apagamento definitivo" e o teste "nenhum resíduo", que só semeia os rastros do titular.
- **Como explorar (local):** depois das exclusões, rodar a varredura (`ILIKE` em todas as colunas `text/varchar/json/jsonb/ARRAY` do `information_schema`) com os textos de teste. As únicas ocorrências foram em `idempotency_records.responseBody` (e texto livre esperado, como `transactions.description`).
- **Correção sugerida (Dev, TL decide):** na exclusão da família, `DELETE FROM idempotency_records WHERE "userId" IN (membros e ex-membros)` ou por `responseBody::text LIKE '%<familyId>%'`. Na exclusão de conta, apagar as respostas que citam o `userId`/`memberId`/e-mail do titular, ou deixar de guardar o corpo e passar a guardar só o status e o id do recurso. Estender o teste de resíduo para semear respostas de idempotência de **outro** usuário.
- **Status:** Aberto · **Rastreio:** SEC-017a/c/d, SDD-028 §7.1/§7.4/§7.5, P2

### SEC-032 — Exportação falha (500) com famílias grandes, antes do teto de 50 MB; arquivo montado inteiro em memória
- **Severidade:** Baixa · **Situação da prova:** **Confirmado** o 500. A causa provável (limite de 32.767 parâmetros do protocolo no `include: { splits: true }`) é **Suspeita**, porque o código do erro é redigido no log.
- **Local:** `src/modules/privacidade/export.ts:28-37` (`loadTransactions` com `include: { splits: true }`), `:295` (`JSON.stringify` inteiro antes de medir); `src/app/api/v1/me/export/route.ts:18` (a cota é consumida antes)
- **Descrição e impacto:**
  - Com **30.002** lançamentos a família exportou 200 (31,7 MB em 1,6 s). Com **33.002** (cerca de 34 MB, abaixo do teto) deu `500 INTERNAL` em 0,3 s, e o log aponta `PrismaClientKnownRequestError` em `currentFamily` → `Promise.all` índice 3 (lançamentos).
  - O titular perde o direito de acesso (LGPD art. 18/19) sem a mensagem de suporte do `413`, e cada tentativa consome a cota de 3 por dia.
  - Com 30 MB, o RSS do servidor subiu de ~0,77 GB para ~1,16 GB: o arquivo é materializado, validado pelo Zod e serializado duas vezes (aqui e no `jsonResponse`), sem o *stream* do SDD §7.3.
  - **Suspeito (não testado):** três exportações simultâneas perto do teto, na mesma instância serverless, podem estourar a memória da função.
  - O volume de 33 mil lançamentos é alto para uma família, mas alcançável com importação ou com anos de uso.
- **Como explorar (local):** inserir em lote 33 mil despesas na família de teste e chamar `GET /api/v1/me/export` ⇒ 500. Com 30 mil ⇒ 200.
- **Correção sugerida (Dev/TL):** paginar os lançamentos (por cursor, lotes de 5 mil) e carregar as divisões por lote. Medir o tamanho em *stream* e cortar com `413` ao passar do teto. Não consumir a cota quando a resposta for 5xx (ou devolvê-la). Teste com mais de 33 mil linhas.
- **Status:** Aberto · **Rastreio:** SEC-017b, US-079, SDD-028 §7.3

### SEC-033 — "Conta excluída" é decidida pelo nome: qualquer membro pode se passar por conta excluída
- **Severidade:** Informativa · **Situação da prova:** **Confirmado** por leitura de código (funções puras)
- **Local:** `src/lib/deleted-account.ts:7`, `src/modules/mcp/tools/common.ts:53`
- **Descrição e impacto:** `memberLabel`/`memberName` mostram "ex-membro (conta excluída)" sempre que `name === "Conta excluída"`, mesmo para membro **ativo**. Quem põe esse nome no perfil Google (ou no login de teste) aparece no histórico e para o assistente como uma conta apagada. É engenharia social leve, por exemplo para esconder a autoria de um lançamento. Também é o motivo pelo qual a SEC-030 consegue "desfazer" o rótulo.
- **Correção sugerida (Dev):** usar `user.deletedAt` (exposto como `deleted: true` no DTO) em vez do nome.
- **Status:** Aberto · **Rastreio:** SEC-017c, US-080, ADR-019

### SEC-034 — `/onboarding?deleted=` exibe texto livre do link (injeção de conteúdo) e leva o nome da família na URL
- **Severidade:** Informativa · **Situação da prova:** **Confirmado**
- **Local:** `src/app/onboarding/page.tsx:37`, `src/app/(app)/familia/excluir/excluir-familia-screen.tsx:52`
- **Descrição e impacto:** a tela mostra `"<deleted até 60 caracteres> excluída"`. Um link como `/onboarding?deleted=Conta invadida! Ligue 0800-000 -` mostra essa frase a qualquer usuário logado sem família. O React escapa o HTML (testado: `<b>` sai como texto), então não há XSS, mas serve de isca de *phishing*. O mesmo padrão já existia em `?left=`. Além disso, o nome da família vai para o histórico do navegador e para os logs de acesso.
- **Correção sugerida (Dev):** passar só um sinalizador (`?deleted=1`) e ler o nome de um *flash* do lado do servidor, ou mostrar um texto fixo ("Família excluída").
- **Status:** Aberto · **Rastreio:** SEC-017d, US-081

### SEC-035 — Cota de exportação: janela fixa em 00:00 UTC e consumível por navegação cruzada
- **Severidade:** Informativa · **Situação da prova:** **Confirmado** (`retryAfterSeconds` termina às 00:00 UTC, e o GET com `Origin: evil.example` respondeu 200 e contou)
- **Local:** `src/app/api/v1/me/export/route.ts:18`, `src/modules/mcp/rate-limit.ts` (janela `floor(now/86400)`)
- **Descrição e impacto:** (a) dá para baixar 3 vezes às 23:59 UTC e mais 3 às 00:00 UTC (6 cópias em 2 min; a UI diz "hoje" e o fuso é o de São Paulo). (b) Por ser GET com o cookie `SameSite=Lax`, um site de terceiros pode abrir `/api/v1/me/export` três vezes por navegação de topo e esgotar a cota do dia da vítima. Não há vazamento: o arquivo cai no navegador da vítima, e sem CORS a origem atacante não lê nada.
- **Correção sugerida (Dev):** exigir um cabeçalho próprio (`X-Requested-With`) ou `Sec-Fetch-Site: same-origin` no GET de exportação. Usar uma janela deslizante de 24 h (ou o dia no fuso da família).
- **Status:** Aberto · **Rastreio:** SEC-017b, SEC-020

### SEC-036 — Exceções das travas dependem só de GUCs que a própria role do app liga; `app.anonymize_user` não é escopado
- **Severidade:** Informativa · **Situação da prova:** **Confirmado** (psql no banco de teste)
- **Local:** `prisma/migrations/20261027020000_sec017_forbid_mutation_purge_bypass/migration.sql`, `prisma/migrations/20261027010000_sec017c_user_deleted_at/migration.sql`, `src/modules/privacidade/delete-account.ts:137-140`
- **Descrição e impacto:**
  - `app.purge_family` e `app.anonymize_user` podem ser ligados por qualquer sessão da role do app. As funções não são `SECURITY DEFINER` e não fixam `search_path`; no ambiente local a role `finance` é dona das tabelas (e superusuária). Hoje só o próprio código liga esses parâmetros (com `set_config` parametrizado, e a lista de tabelas do `executeRawUnsafe` é constante), então **não há caminho de SQL injection**.
  - A trava é proteção contra erro, não contra quem tem a credencial do banco, e essa pessoa poderia desligar os gatilhos de qualquer forma.
  - `app.anonymize_user='on'` deixa mudar **qualquer conteúdo** de `changes` em **qualquer** evento `INVITATION_RESENT` de **qualquer** família durante a transação. É mais largo que o `purge_family`, que é escopado por família.
- **Correção sugerida (TL):** escopar `app.anonymize_user` pelo e-mail ou id (o gatilho só aceita quando `NEW.changes` difere de `OLD.changes` apenas em `email` e o novo valor é `deleted+…@invalid.local`). Fixar `SET search_path = pg_catalog, public` nas funções de trava. Em produção, a role da aplicação não deve ser dona das tabelas (verificar no Prisma Postgres; não verificado aqui).
- **Status:** Aberto · **Rastreio:** SEC-017c/d, ADR-019, ADR-032 §6

### SEC-037 — Ações irreversíveis sem reautenticação nem aviso por e-mail
- **Severidade:** Informativa · **Situação da prova:** **Confirmado** por leitura e uso
- **Local:** `src/app/api/v1/me/delete-account/route.ts`, `src/app/api/v1/family/delete/route.ts`
- **Descrição e impacto:** a confirmação forte é digitar o próprio e-mail (que a tela mostra) ou o nome da família. Quem tem uma sessão roubada, ou um aparelho destravado, apaga a conta ou a família inteira sem passar pelo Google de novo. Também não sai e-mail avisando o titular, o que permitiria reagir. CSRF está bloqueado (ver §3).
- **Correção sugerida (PO/TL):** decidir em P3. Opções: exigir `auth_time` recente (login do Google nos últimos 10 min) para as duas rotas e/ou mandar um e-mail de aviso após a exclusão.
- **Status:** Em análise (usuário) · **Rastreio:** SEC-017c/d, US-080/081

---

## 3. Verificado sem achado

- **IDOR/BOLA na exportação:** `?userId=` e `?familyId=` de outra família são ignorados (não há `query` schema). O arquivo da Alice não trouxe o "Só meu" do Bob, nem dados ou e-mails da Carol (outra família), nem e-mails de terceiros. O arquivo do Bob ativo não trouxe o "Só meu" da Alice. `perfil`, `consentimentos` e `conexoesAssistente` saem por `userId`/`memberId` do próprio titular, sem tokens.
- **Cabeçalhos da exportação:** `Content-Disposition: attachment`, `Cache-Control: no-store`, `nosniff`, sem CORS. Transação `READ ONLY`.
- **Limite 3/dia:** a 4ª chamada ⇒ `429 EXPORT_LIMIT` (as ressalvas estão na SEC-035).
- **Exclusão de conta:**
  - CSRF: sem `Origin`, com `Origin` estranho ou com `text/plain` ⇒ 403. E-mail divergente ⇒ 422. Campo extra (`userId`) ⇒ 400 (`.strict()`). E-mail com espaços ou maiúsculas é aceito (normalizado).
  - Concorrência: 5 pedidos paralelos ⇒ 5 × 200 `{deleted:true}` e um único efeito (`FOR NO KEY UPDATE`). Depois, `/me` ⇒ 401 (sessões apagadas).
  - Varredura de PII do e-mail e do nome em todo o banco: só sobrou em `idempotency_records` de outro usuário (SEC-031) e em texto livre digitado pelos usuários ("Conta Bob", descrições), o que é esperado pela ADR-019.
  - `LAST_ADMIN`/`SOLE_MEMBER`, a revogação de *grants*/tokens MCP (token antigo ⇒ 401 em `/api/mcp`) e os consentimentos de IA estão cobertos pela suíte `sec017c` (passando).
- **Exclusão de família:**
  - Carol (Família B) mandando "Familia A" ⇒ 422 (compara com a própria família). `familyId` no corpo ⇒ 400. Membro comum ⇒ 403. Administrador com outro membro ativo ⇒ 409 `HAS_OTHER_MEMBERS`. O nome é aceito com espaços nas pontas.
  - **Corrida:** exclusão e aceite de convite em paralelo ⇒ exclusão 200 e aceite 500 (erro de FK). Ninguém ficou vinculado a uma família inexistente. O 500 é só cosmético: o log não traz a mensagem nem PII.
  - **Bypass `app.purge_family` em psql:** sem a variável ⇒ bloqueado. Com o UUID de outra família ⇒ bloqueado. Com o UUID em maiúsculas ⇒ bloqueado. Com a variável certa, `UPDATE` em `transaction_revisions` e em `family_events` continua bloqueado; `DELETE` da própria família passa. `set_config(..., true)` é local à transação pela semântica do Postgres, então não deve vazar para a conexão do *pool* depois do `COMMIT` (não testei isso à parte). `UPDATE` em `transactions` passa sempre, mas isso é desenho anterior (só há gatilho de `DELETE`; lançamentos são editáveis com versão).
  - `count = 0` em todas as tabelas com `familyId` (suíte `sec017d`, com a lista vinda do `information_schema`).
  - Detalhe funcional: repetir o pedido com a mesma `Idempotency-Key` depois do sucesso dá `403 NO_FAMILY`, e não a resposta repetida, porque a checagem de família vem antes da idempotência. Não é risco de segurança; vale um ajuste de UX se a resposta se perder na rede.
- **Logs:** nenhum e-mail, nome ou observação de teste apareceu no log do servidor; os erros saem como `describeError` com o código redigido.
- **Páginas:** `/perfil`, `/perfil/excluir-conta` e `/familia/excluir` exigem sessão (307 ⇒ `/login`). `/privacidade` e `/conta-excluida` são públicas e estáticas; o e-mail de contato vem de variável de ambiente, sem entrada do usuário.
- **Suítes de integração** `sec017a/b/c/d`: 50/50 em banco descartável.

## 4. Não foi possível verificar

- **Produção/Vercel/Prisma Postgres:** se a role da aplicação é dona das tabelas ou superusuária (SEC-036), a frequência real do *cron* de expurgo (janela da SEC-031), o limite de memória da função na exportação grande (SEC-032).
- **Google real:** se o Auth.js, num login Google com o e-mail original depois da exclusão, cria de fato um usuário novo (só coberto pelo teste simulado) e se algum fluxo de ligação de conta pode reaproveitar a linha anonimizada (SEC-030).
- **Claude/MCP real:** a revogação foi verificada só pela suíte de integração (cliente simulado), não com o claude.ai.
- **Logs do Postgres em produção:** localmente, violações de unicidade gravam e-mails no `DETAIL` do log do servidor de banco. Isso é anterior a esta entrega e não foi checado na hospedagem.
- **Texto jurídico de `/privacidade`:** fora do escopo técnico; o rascunho aguarda o usuário.
- **Causa exata da SEC-032:** o código do erro do Prisma é redigido no log; a hipótese do limite de parâmetros não foi confirmada no driver.

## 5. Efeitos colaterais desfeitos

O `next dev` reescreveu `tsconfig.json` (incluiu `.next-sec`) e `AGENTS.md` (cabeçalho do bloco do Next). Os dois foram revertidos com `git checkout --`, sem tocar nas mudanças não commitadas do Dev. A pasta `.next-sec/` foi apagada. `finance_sec_lgpd` e `finance_sec_lgpd2` foram apagados. Os scripts de prova ficaram só no scratchpad da sessão. Sem commit (regra da tarefa).
