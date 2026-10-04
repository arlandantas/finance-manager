# US-013 — Corrigir ou excluir um lançamento com trilha de auditoria

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-3 Transações & Categorização · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Should · 5,0 · 3 |
| Status | Refinada (PO) |
| Depende de | US-005, US-007 |
| Rastreabilidade | NEED-001 (autor/auditoria) · NEED-010 (princípio de auditoria) · ADR-001 (ledger imutável, `version`) · ADR-006 |

## História
Como **membro da família**, quero **corrigir ou excluir um lançamento feito por engano**, para **manter saldos e acertos corretos sem perder o histórico**.

## Regras de negócio aplicáveis
- Qualquer membro da família pode editar/excluir lançamentos da família; **toda alteração é auditada** (quem, quando, o quê).
- **Editável**: valor, descrição, categoria, data, quem pagou, comum/pessoal e conta.
- **Excluir** mantém o registro histórico: o lançamento sai dos saldos e totais, fica visível apenas com o filtro *Mostrar excluídos* e pode ser **restaurado**.
- **Concorrência otimista**: se outra pessoa alterou o lançamento desde que a tela foi aberta, o salvamento é recusado com orientação (nunca sobrescrever em silêncio).
- Saldos, extrato, Home e **acerto de contas** são recalculados imediatamente.
- Editar despesa de um mês **já acertado** exibe aviso antes de salvar.
- Lançamentos de **transferência e acerto** não são editáveis; só podem ser **desfeitos** (estorno completo das duas pernas).

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
    Dado "Lucas deve R$ 400,00 para Mariana" no painel
    Quando a despesa comum de Mariana de "R$ 400,00" é excluída
    Então o painel exibe "Lucas deve R$ 200,00 para Mariana"

  Cenário: Aviso em mês já acertado
    Dado que outubro foi quitado
    Quando edito o valor de uma despesa comum de outubro
    Então vejo "Este mês já foi acertado. O saldo do acerto será recalculado." e posso confirmar

  Cenário: Desfazer um acerto
    Dado um acerto registrado de "R$ 400,00"
    Quando escolho "Desfazer acerto" e confirmo
    Então as duas pernas são estornadas e o painel volta a exibir "Lucas deve R$ 400,00 para Mariana"

  Cenário: Transferência não é editável
    Quando abro o detalhe de uma transferência
    Então não há "Editar", apenas "Desfazer transferência"

  Cenário: Validações da edição
    Quando altero o valor para "R$ 0,00"
    Então vejo "Informe um valor maior que zero" e a alteração não é salva
```

## Experiência
Ações *Editar* e *Excluir* no detalhe do lançamento (menu "⋯"); histórico em linha do tempo; confirmação em diálogo; *toast* com ação "Desfazer" por 5 s após excluir.

## Fora de escopo
Edição em lote, exclusão definitiva (hard delete é proibido), permissões diferenciadas por papel, anexos.

## Perguntas em aberto / pontos para o Tech Lead
- Como mapear "editar" sobre o *ledger* imutável (estorno + novo lançamento vs. versionamento com histórico). **Comportamento observável acima é o contrato do PO.**
- **Q-13**: Should (e não Must) por se tratar de correção; sem ela erros de digitação ficam sem remédio. O Gestor decide se sobe para Must.
