# Release v0 alpha — ordem, dependências, corte e pedido ao Tech Lead

*2026-10-05 · De: Agente Product Owner · Para: Gestor e Agente Tech Lead · Insumo: [`escopo-v0-alpha.md`](../../stakeholder/escopo-v0-alpha.md) (com o ajuste do Gestor: "Previstas" é Must junto à Início; menu lateral é o 1º dos Should). Pontos do PO são **preliminares**; o TL confirma. A produção (§3 do escopo: hospedagem, Postgres+backup, Google, segredos, remoção do login de teste) corre **em paralelo e é bloqueante**, mas não é história do PO.*

## 1. Ordem de execução e pontos

| Ordem | História | Pts | Classe | Depende de |
| :-: | :-- | :-: | :-: | :-- |
| 1 | [US-056](stories/US-056-polimento-modal-sobreposto-e-contraste.md) Modal sobreposto + contraste dos estados | 3 | Must | — |
| 2 | [US-052](stories/US-052-aviso-visivel-parcelado-fora-do-acerto.md) Aviso do parcelado fora do acerto | 2 | Must | — |
| 3 | [US-057](stories/US-057-conta-fora-do-saldo-disponivel.md) Conta fora do saldo disponível | 3 | Must | — |
| 4 | [US-058](stories/US-058-despesa-recorrente-mensal.md) Despesa recorrente mensal | 8 | Must | **SDD do TL** |
| 4 | [US-059](stories/US-059-conta-de-pagamento-na-previsao.md) Conta de pagamento na previsão | 2 | Must | junto com a US-058 |
| 5 | [US-055](stories/US-055-faturas-na-tela-a-pagar.md) Faturas na tela A pagar (era Should; vira Must da v0) | 3 | Must | — |
| 6 | [US-061](stories/US-061-inicio-enxuta.md) Início enxuta | 5 | Must | 055 (e 058/059) |
| 6 | [US-062](stories/US-062-filtros-do-extrato-fechados-e-limpar.md) Filtros fechados + limpar | 2 | Must | — |
| 6 | [US-063](stories/US-063-rotulo-previstas-no-resumo-do-mes.md) Rótulo "Previstas" no Resumo | 2 | Must | 055 |
| — | **Fim dos Must = v0 mínima: 30 pts** | **30** | | |
| 7 | [US-064](stories/US-064-menu-lateral-no-desktop.md) Menu lateral no desktop (ajuste da US-038) | 2 | Should (1º) | 056 |
| 8 | [US-060](stories/US-060-resumo-por-conta-no-a-pagar.md) Resumo por conta no A pagar | 3 | Should | 059, 055, 057 |
| 9 | [US-042](stories/US-042-parcelado-dividido-no-acerto-por-parcela.md) Parcela entra no acerto (existente; **toca o motor**, depende da EN-002/R3-A: **não cabe na v0 sem a janela de reversão**; só entra se a EN-002 estiver concluída) | 3 | Should | EN-002 |
| 10 | [US-054](stories/US-054-avisar-antes-de-arquivar-e-botao-flutuante-em-contas.md) Avisar antes de arquivar + "+" em Contas (existente) | 3 | Should | — |
| — | **Total com Should: 41 pts** (Must 30 + Should 11) | **41** | | |

Notas: US-052 e US-055 são existentes (R2.2) e **não foram alteradas**; apenas promovidas a Must da v0 (a US-055 por sustentar Início e Previstas). A **US-052 sai do alpha quando a US-042 entrar**.

## 2. Linha de corte

**Se faltar orçamento, corta daqui para baixo (a partir do item 7, Should).** Os Must (itens 1 a 6, 30 pts) e a produção (bloqueante) **não se cortam**. Ordem de corte dentro dos Should: **US-054 ➔ US-042 ➔ US-060 ➔ US-064** (a US-064 é a última a sair, por decisão do Gestor; a US-060 é o mais valioso depois dela). Pós-v0: transferência agendada/recorrente, US-053, R3-B em diante. Se o item 4 estourar, **não se corta recorrência**: corta-se de baixo para cima antes dela.

## 3. Riscos de ordem
- US-061 e US-063 só fecham com a US-055 (fonte única de "A pagar"). A US-058/059 deve entrar **antes** da Início para o "vence nos próximos dias" mostrar recorrentes.
- US-056 antes da US-064 (o menu lateral herda os tokens de contraste).
- Nada aqui altera o motor do acerto; a única exceção potencial é a US-042 (Should 9), condicionada à EN-002.

## 4. Pedido ao Tech Lead (SDD sugerido: **SDD-019 Recorrência mensal e conta de pagamento**; demais histórias: estimativa/ajuste no mesmo SDD ou nota curta)

Preciso de **SDD (contratos, estados de UI, mapeamento Gherkin ➔ testes)** e **confirmação ou reestimativa** de pontos para US-056..064, com prioridade na **US-058/059 (domínio crítico)**. Perguntas de modelagem:

1. **Modelo:** série (`RecurringExpense`: dia, valor em `amountInCents`, categoria, conta, início, fim por N ou sem fim, `endedAt`) ➔ ocorrências como `PlannedExpense` com `seriesId` e `occurrenceMonth`? Alternativa: gerar sob demanda sem materializar? Recomendação com trade-offs.
2. **Idempotência da geração:** renovação do horizonte de 12 meses ao abrir o app; chave única (`seriesId` + mês) e proteção a concorrência (duas abas/dois membros); reexecução não duplica nem recria ocorrência apagada/baixada. Onde roda (abertura da Início, job, ou ambos).
3. **Fuso e dia 29–31:** vencimento como data civil (sem hora) no fuso da família; regra do último dia do mês; o que acontece com a ocorrência já gerada se a série mudar de dia.
4. **Edição de série:** "só futuras pendentes" (critério exato: vencimento > hoje e não baixada?), ocorrência editada isoladamente ("exceção") sobrevive a edição da série? Encerrar remove (delete) ou marca cancelada (histórico/auditoria)? Fim por N meses contado a partir do início ou das ocorrências restantes?
5. **Interação com baixa e acerto:** baixa de ocorrência segue o fluxo US-019 sem mudanças? A prevista recorrente pode ser "comum/só meu" (acerto): onde guardar a divisão na série e se alterar a série reescreve a divisão das futuras; **nenhum cálculo do acerto/EN-002 pode mudar**.
6. **Conta de pagamento (US-059):** coluna em `PlannedExpense`/série, migração de previstas antigas (nulo), sugestão "conta mais usada" (critério e janela), efeito da conta arquivada.
7. **Saldos (US-057/060):** onde aplicar o filtro `excluiDoDisponivel` com fonte única (card, soma, previsto, resumo por conta); impacto nos testes de regressão S1..S16 (esperado: nenhum).
8. **Fonte única do "A pagar" (US-055/061/063):** Início, A pagar e Resumo consomem a mesma consulta; propriedade de teste "totais iguais".
9. **Diálogos (US-056):** camada única (portal/z-index/pilha de foco) e como testar contraste nos dois temas de forma automatizada.

Restrições: nenhum cálculo existente muda (valores homologados 3.169,90 / 1.584,95 / 1.149,95 e S1..S16 verdes); notas de Gherkin conforme [`pedidos-ao-tech-lead-r21-r3.md`](pedidos-ao-tech-lead-r21-r3.md) §4. Entrega pedida: SDD-019, estimativas e dependências que alterem a ordem acima.

## 5. Histórico
- 2026-10-05 — Criado a partir do `escopo-v0-alpha.md` (IDs US-056..064).
