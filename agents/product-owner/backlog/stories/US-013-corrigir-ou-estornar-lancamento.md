# US-013a — Corrigir ou excluir um lançamento com trilha de auditoria (núcleo)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-3 Transações & Categorização · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Should · 2,8 · 5 (TL: 8 na história inteira; 13a + 13b) |
| Status | Implementada (TASK-015, aguardando validação do Gestor) |
| Depende de | US-005, US-007 |
| Rastreabilidade | NEED-001 (autor/auditoria) · NEED-010 (princípio de auditoria) · ADR-001 (ledger imutável, `version`) · ADR-006 |

## Fatiamento (decisão do PO, 2026-10-04)
A US-013 original (TL: 8 pontos) foi fatiada. **Esta 13a é o núcleo Should (D-GES-03, último a ser cortado)**: editar, excluir, restaurar, auditoria, conflito `409` e recálculo do acerto. A **13b** trata dos efeitos sobre transferências/acertos e do aviso de mês quitado; pode ser cortada sem quebrar a R1, pois depende de US-010/US-011 já entregues.

## História
Como **membro da família**, quero **corrigir ou excluir um lançamento feito por engano**, para **manter saldos e acertos corretos sem perder o histórico**.

## Regras de negócio aplicáveis
- Qualquer membro da família pode editar/excluir lançamentos **divididos** da família; **toda alteração é auditada** (quem, quando, o quê).
- **Exceção — "Só meu" (SEC-021, [US-084](US-084-lancamento-so-meu-so-o-dono-altera.md), D-PO-91)**: lançamentos "Só meu" só podem ser **editados, excluídos, restaurados e estornados pelo dono** (quem pagou), inclusive para Administradores. Os demais membros veem o lançamento sem as ações de alterar.
- **Editável**: valor, descrição, categoria, data, quem pagou, comum/pessoal e conta.
- **Excluir** mantém o registro histórico: o lançamento sai dos saldos e totais, fica visível apenas com o filtro *Mostrar excluídos* e pode ser **restaurado**.
- **Concorrência otimista**: se outra pessoa alterou o lançamento desde que a tela foi aberta, o salvamento é recusado com orientação (nunca sobrescrever em silêncio).
- Saldos, extrato, Home e **acerto de contas** são recalculados imediatamente.
- *(US-013b)* Editar despesa de um mês **já acertado** exibe aviso antes de salvar.
- *(US-013b)* Lançamentos de **transferência e acerto** não são editáveis; só podem ser **desfeitos** (estorno completo das duas pernas).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Correção e exclusão de lançamentos

  Cenário: Corrigir valor
    Dado a despesa de "R$ 150,50" em "Nubank Conjunta" (saldo "R$ 849,50")
    Quando Mariana altera o valor para "R$ 105,50" e salva
    Então o saldo da conta passa a "R$ 894,50"
    E o detalhe mostra "Editado por Mariana"

  Cenário: Trilha de auditoria
    Quando abro o histórico do lançamento
    Então vejo cada alteração com autor, data/hora, campo, valor anterior e valor novo

  Cenário: Excluir com confirmação
    Quando Lucas escolhe "Excluir" e confirma "Excluir lançamento?"
    Então o lançamento some do extrato e o saldo da conta é restabelecido
    E ele passa a constar em "Mostrar excluídos"

  Cenário: Restaurar lançamento excluído
    Dado um lançamento excluído
    Quando clico em "Restaurar"
    Então ele volta ao extrato e ao saldo da conta

  Cenário: Conflito de edição
    Dado que Mariana e Lucas abriram o mesmo lançamento
    E Mariana salvou uma alteração
    Quando Lucas tenta salvar a sua
    Então vê "Este lançamento foi alterado por Mariana. Recarregue para continuar."
    E sua alteração não é gravada

  Cenário: Acerto de contas recalculado
    Dado "Para equilibrar o mês: Lucas transfere R$ 400,00 para Mariana" no painel
    Quando a despesa comum de Mariana de "R$ 400,00" é excluída
    Então o painel exibe "Para equilibrar o mês: Lucas transfere R$ 200,00 para Mariana"




  Cenário: Outro membro não altera o "Só meu" do dono
    Dado uma despesa "Só meu" de "R$ 80,00" paga por Mariana
    Quando Lucas abre o detalhe dessa despesa
    Então vê "Só Mariana pode alterar este lançamento (Só meu)"
    E não vê as ações "Editar" nem "Excluir"

  Cenário: Dono corrige o próprio "Só meu"
    Dado uma despesa "Só meu" de "R$ 80,00" paga por Mariana
    Quando Mariana altera o valor para "R$ 90,00"
    Então a despesa mostra "R$ 90,00"

  Cenário: Validações da edição
    Quando altero o valor para "R$ 0,00"
    Então vejo "Informe um valor maior que zero" e a alteração não é salva
```

## Experiência
Ações *Editar* e *Excluir* no detalhe do lançamento (menu "⋯"); histórico em linha do tempo; confirmação em diálogo; *toast* com ação "Desfazer" por 5 s após excluir.

## Fora de escopo
Aviso de mês acertado e desfazer transferência/acerto (US-013b), edição em lote, exclusão definitiva (hard delete é proibido), permissões diferenciadas por papel (a única exceção é o "Só meu" do dono, US-084), anexos.

## Perguntas em aberto / pontos para o Tech Lead
- Como mapear "editar" sobre o *ledger* imutável (estorno + novo lançamento vs. versionamento com histórico). **Comportamento observável acima é o contrato do PO.**
- **Q-13**: Should (e não Must) por se tratar de correção; sem ela erros de digitação ficam sem remédio. O Gestor decide se sobe para Must.

## Histórico
- 2026-10-04 — **Cenário atualizado (D-PO-41, SDD-011 §9, US-028):** "Acerto de contas recalculado" com o texto neutro do herói; valores inalterados.
- 2026-10-24 — **Exceção "Só meu" (SEC-021, D-PO-91):** a regra "qualquer membro edita/exclui" vale só para lançamentos divididos; "Só meu" é do dono (quem pagou). 2 cenários novos aqui; regra completa na US-084.
