# Pedidos ao Tech Lead — R2.1 e R3

*Atualizado: 2026-10-04 · De: Agente Product Owner · Para: Agente Tech Lead · Cópia: Gestor*
*Insumos: [`US-022..US-051`, `EN-002`, `EN-003`](stories), [`decisoes-po-r21-r3.md`](decisoes-po-r21-r3.md), [`backlog.md`](backlog.md). Tamanhos do PO são **preliminares**; peço **confirmação ou ajuste** e **SDDs** (ver §3).*

## 1. Perguntas prioritárias (pedidas pelo Gestor/Stakeholder)

### P1. Estimativa do **parcelamento básico** — o Gestor decide se vai para a R2.1
- Estimar **US-040** (compra parcelada básica, sem edição em lote) e **US-042** (parcelado dividido no acerto por parcela). Estimativa do PO: **5** e **3**.
- **Regra do PO para puxar para a R2.1** (decisão final do Gestor, D-PO-12 §2.3): US-040 ≤ 5 **e** US-042 ≤ 3 ⇒ puxar ambas (fim dos Must da R2.1, após a US-030); US-040 ≤ 5 e US-042 > 3 ⇒ só a US-040 com "Dividir" indisponível; caso contrário ⇒ R3. **Apontar o que, se cortado, derruba a estimativa** (ex.: sem "Ver compra", sem 24x).
- Pontos que mais pesam: modelo da compra-mãe e parcelas no ledger (**ADR-014**), consumo e liberação de limite por fatura paga, data da parcela em meses curtos, rótulo "n/N", extrato por parcela.
- **Competência assimetria (D-PO-26)**: parcela conta no **mês da fatura** e a compra à vista pela **data da compra**. É viável sem tocar nos números homologados? Há risco de o Resumo do Mês e o Extrato divergirem do acerto? Alternativa de uniformização e custo.

### P2. **Spike de múltiplos grupos (EN-003)**
- Hoje o vínculo usuário↔família é N:N no schema (mesmo que a regra de produto seja 1)? Quais **consultas, rotas, sessão e convites** assumem "uma família por usuário"?
- Custo, em pontos, de: (a) **uma pessoa em mais de um grupo** com troca de grupo ativo; (b) **conta privada dentro do grupo** (só o titular vê; opção de entrar no acerto); impacto em D-PO-02/US-020 e em "ocultar valores".
- Como garantir **isolamento por grupo** em toda consulta (teste de propriedade) e o que o RLS/escopo por `familyId` já cobre. Entregável: **ADR**. Sem mudança de comportamento.

### P3. **Migração do cálculo do acerto com regressão (EN-002)**
- Estratégia de migração dos lançamentos existentes para "percentual gravado no lançamento" **sem alterar nenhum número**: cada lançamento recebe o percentual da regra vigente **na data dele** (vigência por data, Q-08).
- **Regressão obrigatória** sobre os valores homologados: outubro/2026 despesas comuns **R$ 3.169,90**, cota **R$ 1.584,95** a 50/50, diferença **R$ 1.149,95**; setembro **R$ 717,00**, cota **R$ 358,50**, diferença **R$ 260,50**; mês com mudança de regra (50% até 03/10 e 58/42 depois, despesas de R$ 400,00 e R$ 1.000,00 ⇒ cotas R$ 780,00 e R$ 620,00). Propor o **instantâneo "antes e depois"** automatizado (todos os meses de todas as famílias de teste) e o critério de **falhar o deploy** se qualquer cota mudar 1 centavo. Reaproveitar os vetores **S1..S13** do SDD-002.
- A migração deve ser **idempotente, atômica e reversível** (ponto de retorno) e ter **rollback testado**.

### P4. **Modelo de gravação do percentual por lançamento**
- Opções: (A) coluna(s) no lançamento (percentual do pagador em *basis points*); (B) tabela de **rateio por lançamento e por membro** (útil para N > 2, US-009b); (C) JSON. Recomendação e justificativa, considerando: soma = 100% (10 000 bps), **sobra de centavo ao pagador** (RN-018.3), 0%/100% (reembolso), N membros, **parcelas herdando** o percentual da compra (US-042), edição em mês acertado (US-013b), **ex-membros** (US-035) e consultas do Resumo e da Análise.
- O que acontece com a **tabela de vigência da regra** (continua para *sugerir* o percentual inicial; deixa de ser usada no cálculo)? Impacto no rótulo ponderado (US-022): ele deve nascer **antes** da EN-002 (calculado pela vigência) e **continuar igual** depois (calculado pelos percentuais gravados). Confirmar que as duas fontes dão o mesmo número.

## 2. Perguntas por história (não bloqueantes; podem virar nota no SDD)

| Hist. | Pergunta |
| :-- | :-- |
| US-022 | O DTO do acerto pode expor **trechos de vigência** e o **percentual ponderado** do mês, da mesma fonte das cotas? |
| US-023 | A sugestão da conta de origem é calculada no servidor (junto ao DTO da fatura/previsão) ou no cliente? Como obter "mais usada por quem paga" sem nova tabela? |
| US-024 | Onde o padrão "descrição vazia = nome da categoria" é aplicado (cliente ou servidor), mantendo `min(2)` do contrato (Q-05)? |
| US-025 | Agregado único do Resumo (competência/caixa) **reaproveitando o critério do Extrato** (propriedade de teste: soma do resumo = soma do Extrato). Definição de "A pagar" e "saldo previsto" em meses passados e futuros (ver US-025). |
| US-026 | Preferência "recolhido/expandido" por dispositivo: mesmo mecanismo de US-027 e US-037? |
| US-027 | **Armazenamento da preferência** (localStorage por usuário e dispositivo): como tratar "dispositivo/sessão novo" (padrão **oculto**) e **troca de usuário no mesmo dispositivo**? Renderização **oculta no SSR** para evitar flash. Um componente único `Money` para todo valor monetário? Impacto em gráficos futuros. |
| US-028 | Onde guardar a chave do acerto (coluna na `Family`)? Como API/rotas reagem ao estado desligado (404/redirect com mensagem)? Garantir que religar **não recalcula** nada e que `isSharedExpense` e acertos permanecem. |
| US-029 | Consulta de "meses anteriores com diferença em aberto" com **janela de 12 meses**: custo e cache. |
| US-030 | Confirmar que mudar o **padrão do formulário** (e das previstas) não exige mudança no `computeSettlement`. |
| US-031 | Cálculo da **prévia** reaproveitando `computeSettlement` em modo "e se" sem gravar. |
| US-032/033 | `archivedAt` como em categorias (US-014)? Invariantes do ledger com conta arquivada; definição de "nunca teve movimentação" (lançamento de abertura com saldo zero); consulta de "fatura aberta com compras ou parcelas futuras". |
| US-034/035 | **Modelo de ex-membro** (`Member.removedAt`, sem login, FKs do ledger preservadas); **invalidação de sessão** imediata; reutilizar o e-mail de ex-membro em novo convite; garantia atômica do **último Administrador** sob concorrência; reatribuição de titularidade em lote. |
| US-036 | Reuso do componente de detalhe do Extrato e roteamento (rota paralela/intercepting vs. estado local). |
| US-037 | Estratégia **anti-flash** do tema (script inline antes da hidratação) e auditoria de cores fixas. |
| US-038 | Um único *container* de layout na raiz; drawer de lançamento no desktop independente da largura da janela. |
| US-039 | Endpoint de **reenvio de convite** e limite de reenvios (hipótese: 3). |
| US-041 | Modelo de "esta e as próximas" (versão da série); trilha de auditoria por parcela; exclusão da compra inteira com parcelas em faturas fechadas. |
| US-044 | `Category.defaultSplit` e consulta de despesas "Só meu" do mês. |
| US-045..047 | Normalização por caixa e acentos e unicidade por família; N:N de tags; índices; mesclagem atômica e idempotente; filtro "qualquer das tags" sem duplicar linhas e totais. |
| US-048/049 | Consulta única parametrizada por `groupBy` e filtros; **propriedade**: soma da Análise = soma do Extrato; custo com N:N de tags e parcelas. |
| US-050 | Campo `color` (enum curto) e migração das contas/cartões existentes. |
| US-051 | Reaproveitar a entidade de previsão (ADR-015) com `kind` receita/despesa ou entidade própria? Impacto na rota `/previstas` e no bloco "A pagar". |

## 3. O que o PO pede de entrega ao TL
1. **Confirmar ou reestimar** os pontos (R2.1 = 60; R3 = 56) e devolver as **dependências técnicas** que mudem a ordem do PO (D-PO-12).
2. **SDDs** (sugestão de agrupamento): SDD-010 *Resumo do Mês, ocultar valores e preferências* (US-025..027, 036..038); SDD-011 *Acerto opcional, rótulo e prévia* (US-022, 028..031); SDD-012 *Manutenção de cadastros* (US-032..035); SDD-013 *Pagamentos: conta padrão e descrição* (US-023, 024, 039); R3: SDD-014 *Parcelamento* (US-040..042), SDD-015 *Percentual por lançamento e migração* (EN-002, US-043, 044), SDD-016 *Tags e visões* (US-045..049), SDD-017 *Cor e receitas previstas* (US-050, 051) e o **ADR do spike** (EN-003).
3. **Guia de testes** por história a partir dos cenários Gherkin; especialmente a **regressão do acerto** (P3).

## 4. Notas para o Dev & QA sobre o Gherkin (lições DEV-06, 11, 15, 25)
- Os cenários **não** usam `E, após…`; **nenhuma frase** ocupa várias linhas; **todo cenário** tem contexto `Dado` (no `Contexto` ou no próprio cenário).
- Passos como "Dado que os valores estão ocultos", "Quando X abre a Home" e "Dado hoje é dd/mm/aaaa" se **repetem de propósito** com o **mesmo significado** em várias histórias (não colidem). Passos de **conteúdo semelhante com significado diferente** (DEV-25) foram evitados; se o parser acusar colisão, o Dev ajusta o texto (como já feito) e registra em `agents/manager/pedidos-ao-gestor.md`.
- Valores de exemplo seguem os dados homologados (3.169,90; 1.584,95; 717,00; 358,50; 260,50) para facilitar as regressões.

## 5. Histórico
- 2026-10-04 — Criado com as perguntas pedidas pelo Gestor (parcelamento, spike de grupos, migração do acerto e modelo de gravação do percentual) e as perguntas por história.
- 2026-10-04 — **Respondido** pelo Tech Lead em [`respostas-r21-r3.md`](../../tech-lead/respostas-r21-r3.md) (SDD-010..017, ADR-016..019). Efeitos no backlog: [`decisoes-po-r21-r3.md`](decisoes-po-r21-r3.md) §2b (D-PO-33..42).
