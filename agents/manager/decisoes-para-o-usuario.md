# Decisões que dependem do usuário (para a homologação)

*Compilado pelo Gestor em 2026-10-04. Nada aqui bloqueia o desenvolvimento: cada item tem uma hipótese já adotada. Responda quando for validar a R1/R2.*

## A. Regras de negócio
| ID | Decisão | Hipótese adotada | Impacto se mudar |
| :-- | :-- | :-- | :-- |
| Q-20 | No acerto de contas, compra no cartão é creditada a **quem comprou** (não a quem paga a fatura). Pode divergir do desembolso real num casal em que um compra e o outro paga a fatura. | Quem comprou (RN-003.3) | Alterar o cálculo do acerto na R2 (SDD-002/008, ADR-014) |
| Q-18 | Compra **no dia do fechamento** entra na fatura que fecha naquele dia. | Sim | Regra de ciclo da fatura (SDD-008) |
| Q-19 | Dias de fechamento/vencimento **travados** após a primeira compra do cartão. | Travados; nome, limite e titular editáveis | Exigiria ciclo versionado por vigência |
| Q-21 | Pagamento de fatura **integral**; sem parcial, juros ou antecipação. | Integral, só fatura fechada | Parcial/juros iria para AP1/AP2 |
| Q-22 | "Dividir com a família" nas despesas previstas é decidido no cadastro, padrão **ligado**. | Ligado | Ajuste de formulário |
| Q-01 | Dependentes sem login (ex.: filhos) como responsáveis por gasto. | **Fora do MVP** (US-021). **Reaberta e respondida** pela NEED-028 (Q-U15, D-GES-62) e pelo ADR-033 (Q-TL-U1..U5, D-GES-63, seção H) | Novo épico, mexe no modelo de membros |
| D-PO-01 | Um único campo "Quem pagou?" no lançamento. | Aprovada | Formulário e modelo (`payerMemberId`) |
| D-PO-02 | Todos os membros veem e lançam em todas as contas e cartões. | Aprovada | Exigiria permissões granulares (US-020) |

## B. Escopo e prazo
- **Ordem de corte** se precisar reduzir: R1 → US-013b, US-009b, US-013a. R2 → US-014, US-017b, US-016b.
- **Estimativa:** R1 = 70 pontos; R2 = 32 pontos (Tech Lead e PO concordam).

## C. Validação prática (só você pode dar)
Usar o app com login de teste e dizer se o fluxo *lançar → acertar → ver a home* resolve a dor de fechar o mês em casal. Relatório de QA da R1: `agents/_historico/developer/tasks/qa-r1.md` (quando pronto).

## D. Contas e serviços externos
Ver [`pendencias-externas.md`](pendencias-externas.md) (Google OAuth, SMTP/domínio, hospedagem, Sentry, CI, `AUTH_SECRET`).

## E. Acesso externo ao app local (túnel)
Ver `pendencias-externas.md`, item EXT-10.

## F. R4 proposta: parcelas pagas, importação de fatura, análise por IA e MCP (2026-10-24)
Origem: NEED-024..027, backlog R4 (US-065..077, EN-004..006, 81 pts PO prelim.) e [`_historico/product-owner/backlog/decisoes-po-ia-e-parcelas.md`](../_historico/product-owner/backlog/decisoes-po-ia-e-parcelas.md). Hipóteses valem até o usuário responder.

| ID | Decisão | Hipótese adotada | Bloqueia |
| :-- | :-- | :-- | :-- |
| Q-U01 | Enviar dados financeiros à Anthropic, com opt-in por família | Sim, com opt-in e aviso | R4-B/C (se "não", cai o bloco de IA, ~50 pts) |
| Q-U08 | Chave Anthropic: única do app ou por usuário/família | Única do app | R4-B/C |
| Q-U10 | Teto mensal de custo de API por família | Definido pelo usuário (valor em aberto) | R4-B |
| Q-U03 | Parcelas já pagas: reconstruir histórico passado? | Não, só o restante | não bloqueia a US-065 |
| Q-U04..06 | MCP por membro; só leitura primeiro; padrão aberto | Conforme descrito | R4-D |
| Q-U07/09 | Fatura inteira à LLM; PDF e CSV primeiro | Conforme descrito | R4-B |
| Q-U11/12 | Análise só com agregados; método essencial/importante/supérfluo | Conforme descrito | R4-C |

**Atualização (2026-10-24):** Q-U01 respondida (opt-in por família + anonimização máxima); Q-U08 respondida (chave única do app); Q-U10 **em análise** pelo usuário; importação de fatura (Q-U07/Q-U09) **adiada para a R5** (D-GES-28). Ver D-GES-27..30.

**Pendentes após o Tech Lead (2026-10-24):** TL-23 (enviar o rótulo saneado da categoria, único texto livre do payload; hipótese: sim), TL-24 (US-072 como regra local, sem IA; hipótese: sim), TL-25 (retenção das análises, expurgo em 24 meses), TL-26 (retenção da Anthropic: o opt-in não promete retenção zero por ora), TL-27 (**teto mensal**; sugestão R$ 5,00 por família, ≈ R$ 0,01 por análise), TL-29 (R5 de importação sem IA, extração local de CSV/OFX/PDF-texto; hipótese: sim). Detalhes em `_historico/tech-lead/respostas-r4.md`.

## G. Uso real: NEED-028..034 (2026-10-26) — RESPONDIDAS pelo usuário
Todas as hipóteses do Stakeholder foram aprovadas em 2026-10-26, **exceto Q-U20**. Nada deste bloco depende mais do usuário. Ordem aprovada: 1) NEED-033, 2) NEED-034, 3) NEED-032, 4) NEED-031, 5) NEED-028, 6) NEED-029, 7) NEED-030. Registro: D-GES-62; histórias US-060, US-085..US-101 em `product-owner/backlog/`.

| ID | Decisão | Resposta (usuário, 2026-10-26) |
| :-- | :-- | :-- |
| Q-U15 | Membro sem conta: adulto que ainda não entrou, dependente ou ambos | Os dois, mesmo mecanismo |
| Q-U16 | Membro sem conta entra no acerto | Sim |
| Q-U17 | Quem cadastra e convida | Só o Administrador |
| Q-U18 | Assinatura no cartão: lançada sozinha ou só prevista | Lançada sozinha, com correção do valor do mês |
| Q-U19 | Assinatura dividida entra no acerto | Sim |
| Q-U20 | Transferência prevista repete todo mês | **Sim, pode ter recorrência mensal** (muda a hipótese) |
| Q-U21 | Série "todo mês" na mesma porta do lançamento | Sim, só informativa |
| Q-U22 | Pagar a fatura sozinho na data | Não: o app só sugere a conta e avisa o vencimento |
| Q-U23 | Conta pagadora obrigatória no cartão | Opcional |
| Q-U24 | Saldo previsto por conta inclui previstas "Só meu" de outro membro | Sim |

## H. Membro sem conta: Q-TL-U1..U5 do ADR-033 (2026-10-30) — RESPONDIDAS pelo usuário
Q-TL-U1..U5 respondidas; a revisão da Segurança (SEC-058..068, 2026-10-30) concordou com U2/U5 e com U3/U4 sob condições já incorporadas no ADR. As 2 perguntas novas da Segurança foram respondidas em 2026-10-30 (D-GES-64). Registro: D-GES-63; modelo em `tech-lead/adrs/ADR-033-membro-sem-conta-e-convite-vinculado.md`.

| ID | Decisão | Resposta (usuário, 2026-10-30) |
| :-- | :-- | :-- |
| Q-TL-U1 | Cadastrar alguém inclui a pessoa na divisão igual das despesas novas? | Sim, com aviso no cadastro; quem não divide usa proporcional com 0% |
| Q-TL-U2 | Alguém pode tornar "Só meu" uma dividida paga pelo membro sem conta? | Ninguém, até ele assumir o cadastro |
| Q-TL-U3 | Quem cria "Só meu" em nome do membro sem conta | Só o Administrador |
| Q-TL-U4 | O nome do cadastro continua valendo depois que a pessoa assume? | **Não: a pessoa escolhe o próprio nome ao assumir; o do cadastro é provisório** (muda a recomendação do TL) |
| Q-TL-U5 | Anonimizar o e-mail dos convites do cadastro removido na hora | Sim (a Segurança concorda e amplia: também ao editar o e-mail e sem e-mail no histórico de reenvio) |

**Revisão da Segurança (respondidas, D-GES-64):**

| ID | Decisão | Resposta (usuário, 2026-10-30) |
| :-- | :-- | :-- |
| SEC-060 | Cadastro perguntar "Entra na divisão das despesas?" | Não: vale só o aviso da Q-TL-U1 |
| SEC-062(3) | Criar "Desvincular conta" agora | Não por ora; só o aviso aos Administradores quando o cadastro é assumido |
