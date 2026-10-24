# ADR-029: Privacidade para LLM — opt-in por família e finalidade, payload só de agregados por *allowlist* e retenção mínima

## Status
Aceito (Tech Lead), 2026-10-24. Base do [SDD-022](../sdd/SDD-022-opt-in-privacidade-en-005.md) (EN-005) e do contrato de payload do [SDD-023](../sdd/SDD-023-analise-de-gastos-evitaveis.md). Complementa o [ADR-028](ADR-028-integracao-llm-cliente-unico-e-teto-de-custo.md). Rastreabilidade: RN15, RN16 · NEED-023, NEED-027 (RN-027.1, 027.8, 027.9) · EN-005 · D-PO-58, D-PO-64 · **D-GES-27** (opt-in por família; anonimização máxima), **D-GES-29** (só agregados: totais por categoria/mês, sem nomes, descrições, contas, membros, datas exatas).

## Contexto
O usuário autorizou o envio à Anthropic **somente** com opt-in da família e anonimização máxima. As histórias do PO (US-070..072) foram escritas antes dessa decisão e pressupõem, em dois pontos, dados que D-GES-29 proíbe: o **nome do recorrente** ("Streaming X") e a **descrição do lançamento** para sugerir recategorização ("Droga Raia"). Este ADR define o que sai, como se prova que nada além sai, e resolve esses dois conflitos sem enviar texto livre.

## Decisão

### 1. Consentimento: por família, por finalidade, versionado
- Finalidades fechadas: `SPENDING_ANALYSIS` (R4) e `INVOICE_IMPORT` (reservada para a R5; sem tela de ligar até lá).
- Desligado por padrão; só `ADMIN` liga/desliga; ligar exige confirmar o texto **da versão vigente** (`AI_CONSENT_TEXTS[purpose].version`, constante versionada no código). Registro *append-only* (quem, quando, versão, ligar/desligar).
- **Efetivo** = último registro é "ligado" **e** sua versão = vigente. Publicar versão nova desliga na prática, sem migração.
- Verificação **no momento do envio**, dentro da transação que reserva o custo (ADR-028 §5), com a linha de consentimento lida `FOR SHARE`: desligar concorrente vence ou espera; nenhuma chamada sai depois de o desligar ter sido confirmado.
- Desligar não apaga dados; apagar análises é a US-073.

### 2. Payload: *allowlist* estrita, só agregados
O payload é **construído** (nunca filtrado a partir de objetos de domínio) por uma função pura `buildAnalysisPayload` e validado por um schema Zod `.strict()` cujo único texto livre é o **rótulo saneado da categoria**. Conteúdo permitido (contrato exato no SDD-023 §2):
- Mês **relativo** (`0` = mês analisado, `-1`, … até `-5`) e a marca `partial`; **nenhuma data**, nem ano.
- Por categoria de despesa: `ref` opaco (`C1..Cn`, sorteado por pedido), rótulo saneado, ícone (enum fixo), total em centavos por mês relativo, contagem de lançamentos por mês.
- Totais gerais por mês (despesa, receita).
- **Recorrentes como referências opacas** (`R1..Rn`): categoria (`Cx`), valor mensal médio em centavos, meses presentes (relativos), origem (`SCHEDULED` = despesa recorrente cadastrada, `DETECTED` = detectada localmente). **Sem nome ou descrição.** O app guarda localmente o mapeamento `Rk → descrição` para exibir "Streaming X" na tela (resolve o conflito 1).
- Descartes da família (US-071) **não** são enviados como texto: os recorrentes descartados simplesmente **não entram** no payload.
- **Proibido** (teste de propriedade): nomes e e-mails de membros, ids internos (UUIDs), nomes/ids de contas e cartões, descrições, notas, tags, datas, `familyId`, quem pagou, rateio, saldos de conta, limites.

### 3. Saneamento do rótulo de categoria (o único texto livre)
Categorias são nomeadas pela família e podem conter nomes ("Escola do João") ou números. Regras de `sanitizeCategoryLabel` (pura, vetores no SDD-023): NFKC; remover dígitos, `@`, URLs e e-mails; substituir por "pessoa" qualquer palavra que coincida (sem caixa e acento) com nome, sobrenome ou parte do e-mail de **qualquer** membro atual ou ex-membro da família; colapsar espaços; ≤ 40 caracteres; vazio ⇒ "Outra categoria". A tela "O que será enviado" mostra **exatamente** os rótulos saneados. Esta é a única concessão a texto e é necessária para a IA distinguir "Mercado" de "Lazer"; **depende de confirmação do usuário** (pendência TL-23).

### 4. Recategorização (US-072) sem LLM
Sugerir "Droga Raia: de Lazer para Saúde" exige a descrição, que D-GES-29 proíbe enviar. Decisão: a US-072 passa a ser **regra local, sem IA**: para cada chave de descrição normalizada com ≥ 3 lançamentos nos últimos 6 meses, se um lançamento está numa categoria diferente da categoria **majoritária** (≥ 70%) da mesma chave, sugere-se a majoritária. Nada sai do app; aceitar segue "uma a uma". **Pendência ao PO/usuário** (TL-24): aceitar a troca de mecanismo (a sugestão vem da "consistência do histórico", não da IA).

### 5. Prova automatizada de anonimização
1. Schema Zod `.strict()` em todos os níveis + `assertNoIdentifiers(payload, family)`: percorre todas as *strings* do payload e falha se alguma contiver nome/sobrenome/e-mail de membro, nome de conta/cartão, descrição de lançamento ou UUID (regex) da família de teste.
2. Teste de propriedade (≥ 200 famílias geradas com nomes, descrições e categorias "maliciosas" — com nomes de membros, CPF, números de cartão, instruções do tipo "ignore as regras"): o payload passa no schema e em `assertNoIdentifiers`; o `FakeLlmAdapter` registra o que recebeu e o teste compara **byte a byte** com o payload exibido em "O que será enviado".
3. Teste de chave: as chaves permitidas do JSON são exatamente as do contrato (*snapshot* da lista de chaves; acrescentar campo exige mudar o teste e este ADR).

### 6. Retenção e o que se grava
- **Análise** (`spending_analyses`): payload enviado (o mesmo JSON, para "O que foi enviado", US-073), resultado validado, mapeamento local `Rk/Ck → ids` (fica **só** no nosso banco), modelo, data, autor. Retenção: até o usuário apagar, com **expurgo automático após 24 meses** (proposta; pendência TL-25). Apagar = `DELETE` físico (não exclusão lógica), inclusive "apagar todo o histórico".
- **Registro de consumo** (`llm_usage_events`): sem conteúdo; mantido 24 meses; a referência à análise vira `NULL` quando ela é apagada.
- **Consentimentos**: mantidos enquanto a família existir (prova de consentimento, LGPD art. 8º §2º).
- Logs: nunca conteúdo (ADR-028 §6).

### 7. Termos do provedor e o texto do opt-in
O texto **não** promete "retenção zero" nem "não usado para treino" enquanto o Gestor não confirmar os termos comerciais vigentes da API da Anthropic para a conta do app (pendência externa, TL-26). Texto seguro proposto (v1, análise): "Para analisar, o app envia à Anthropic apenas totais por categoria dos últimos meses e valores de gastos recorrentes, sem nomes de pessoas, descrições, contas, cartões ou datas. Você pode desligar quando quiser." Se o usuário quiser a promessa de não-retenção, avaliar *Zero Data Retention* com a Anthropic (contratual, fora do código).

### 8. LGPD (mínimo antes de produção)
Base legal: consentimento (opt-in registrado e revogável) — dados financeiros não são "sensíveis" no art. 5º II, mas o tratamento é minimizado. Antes da produção com IA ligada: (a) página "Como tratamos seus dados" com o provedor nomeado e a finalidade; (b) apagar análises (US-073) e desligar (EN-005) funcionando; (c) registro de operações (consentimentos + consumo). Transferência internacional (art. 33): o consentimento específico cobre o envio aos EUA — **o texto deve dizer que o provedor fica fora do Brasil** (acrescentado na v1 do texto pelo PO).

## Alternativas descartadas
- **Enviar descrições "generalizadas"** (ex.: só a 1ª palavra): ainda vaza nomes de pessoas em PIX/transferências; viola D-GES-29.
- **Mapear categorias para uma taxonomia fixa e não enviar rótulos**: mais privado, mas exige classificar à mão cada categoria criada pela família (história nova); fica como alternativa se o usuário recusar o rótulo saneado (TL-23).
- **Filtrar (blocklist) objetos de domínio**: um campo novo no domínio vazaria por padrão. *Allowlist* construída é obrigatória.
- **Consentimento por membro**: fora de escopo (EN-005); a família é a unidade.

## Consequências
- A US-070 mantém o valor (classificação + "possíveis gastos evitáveis" com nome exibido localmente) sem texto livre; a explicação da IA fala de **categoria e padrão**, nunca do estabelecimento (ela não o conhece).
- A US-072 muda de mecanismo (regra local) e de dependência (não precisa mais da EN-004).
- A importação de fatura (R5) **não** cabe neste ADR: arquivo bruto não é agregado (D-GES-28); ver o parecer.
