# US-032 — Arquivar, reativar e excluir conta bancária

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-18 Manutenção de Cadastros · **R2.1** |
| MoSCoW · WSJF · Tamanho (TL) | Must · 2,0 (recalc.) · 5 (PO: 3) |
| Status | **Especificada** (SDD-012, pronta para o Dev) · tamanho re-estimado pelo TL |
| Depende de | US-004, US-010 (transferir para zerar o saldo), US-007 |
| Corte | **Não cortar** (conta criada por engano não pode ficar para sempre) |
| Rastreabilidade | Parecer item 13, Q-F11 · NEED-020 (RN-020.2, RN-020.1) · NEED-002 · FLUXO-010 · D-PO-17 |

## História
Como **membro da família**, quero **arquivar uma conta que não uso mais (ou excluir uma criada por engano)**, para **manter listas e seletores limpos sem perder o histórico**.

## Regras de negócio aplicáveis
- **"Excluir" = exclusão lógica terminal** (D-PO-36, TL-04): o ledger não aceita `DELETE` e toda conta nasce com um lançamento de abertura, então a conta excluída **some de todas as telas** (inclusive de "Contas arquivadas"), **libera o nome** e **não pode ser reativada**; para o usuário o efeito é o de excluir de verdade, e o texto "Excluir definitivamente" continua válido.
- **Excluir**: só se a conta **nunca teve movimentação**: nenhum lançamento, transferência, acerto, baixa ou lançamento de abertura além do saldo inicial zero. Exige confirmação. (Conta criada com saldo inicial ≠ 0 já tem lançamento de abertura ⇒ só arquiva.)
- **Arquivar**: exige **saldo zero** (Q-F11). Com saldo ≠ 0, o app bloqueia e oferece **"Transferir o saldo"** (leva à US-010 com a conta pré-selecionada).
- Conta arquivada **some** das listas, dos seletores de lançamento/transferência/baixa e do **saldo da família**; o **histórico** (lançamentos, extrato, acertos, faturas pagas por ela) permanece intacto e a conta aparece nele com o marcador "(arquivada)" (RN-020.1).
- Seção "Contas arquivadas" na tela de Contas (recolhida) com **Reativar**.
- **Reativar** devolve a conta às listas com o mesmo saldo (zero).
- **Permissão**: qualquer membro arquiva/reativa (D-PO-02: todos veem e lançam em todas as contas); só o **Administrador** exclui definitivamente. Hipótese do PO, ver D-PO-17.
- Arquivar a **última conta ativa** é permitido, com aviso: "Sem contas ativas você não poderá lançar despesas em conta nem pagar faturas."
- Concorrência: arquivar usa **versão** (conflito: "Esta conta foi alterada por X. Recarregue.").

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Arquivar e excluir conta

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" Administradora e "Lucas" Membro
    E a conta "Poupança" com saldo "R$ 0,00" e histórico de lançamentos
    E a conta "Carteira antiga" com saldo "R$ 0,00" e nenhum lançamento
    E a conta "Itaú Lucas" com saldo "R$ 3.000,00"
    E Mariana está autenticada em "Contas"

  Cenário: Arquivar conta com saldo zero
    Quando Mariana arquiva a conta "Poupança" e confirma
    Então vê "Conta arquivada"
    E "Poupança" não aparece na lista de contas

  Cenário: Conta arquivada some dos seletores
    Dado que a conta "Poupança" foi arquivada
    Quando Mariana abre o formulário "Nova despesa"
    Então "Poupança" não aparece em "Pagar com"

  Cenário: Histórico permanece com marcador
    Dado que a conta "Poupança" foi arquivada
    Quando Mariana abre o Extrato
    Então os lançamentos antigos da "Poupança" continuam visíveis
    E mostram "Poupança (arquivada)"

  Cenário: Saldo ainda diferente de zero bloqueia o arquivamento
    Quando Mariana tenta arquivar a conta "Itaú Lucas"
    Então vê "Para arquivar, o saldo precisa ser zero. Transfira ou ajuste o saldo antes."
    E vê o botão "Transferir o saldo"
    E a conta continua ativa

  Cenário: Transferir o saldo leva à transferência com a conta preenchida
    Dado que Mariana tentou arquivar a conta "Itaú Lucas" com saldo ainda diferente de zero
    Quando Mariana toca em "Transferir o saldo"
    Então o formulário de transferência abre com origem "Itaú Lucas" e valor "R$ 3.000,00"

  Cenário: Saldo da família ignora conta arquivada
    Dado que a conta "Poupança" foi arquivada
    Quando Mariana abre a Home
    Então o total em "Saldos das contas" não inclui "Poupança"

  Cenário: Reativar conta arquivada
    Dado que a conta "Poupança" foi arquivada
    Quando Mariana abre "Contas arquivadas" e toca em "Reativar" na "Poupança"
    Então "Poupança" volta à lista de contas com saldo "R$ 0,00"
    E volta a aparecer em "Pagar com"

  Cenário: Excluir conta sem nenhuma movimentação
    Quando Mariana exclui a conta "Carteira antiga" e confirma "Excluir definitivamente"
    Então vê "Conta excluída"
    E "Carteira antiga" não existe em nenhuma lista

  Cenário: Excluir libera o nome da conta
    Dado que a conta "Carteira antiga" foi excluída
    Quando Mariana cadastra uma conta chamada "Carteira antiga"
    Então a conta é criada sem aviso de nome já usado

  Cenário: Conta arquivada continua ocupando o nome
    Dado que a conta "Poupança" foi arquivada
    Quando Mariana cadastra uma conta chamada "Poupança"
    Então vê o aviso de que o nome já está em uso

  Cenário: Conta com histórico só pode ser arquivada
    Quando Mariana abre as ações da conta "Poupança"
    Então vê "Arquivar"
    E não vê "Excluir"

  Cenário: Membro não exclui definitivamente
    Dado que Lucas está autenticado em "Contas"
    Quando Lucas abre as ações da conta "Carteira antiga"
    Então vê "Arquivar"
    E não vê "Excluir"

  Cenário: Conflito de versão
    Dado que Lucas e Mariana abriram as ações da conta "Poupança"
    Quando Mariana arquiva a conta
    E Lucas tenta arquivar a conta
    Então Lucas vê "Esta conta foi alterada por Mariana. Recarregue para continuar."

  Cenário: Duplo clique arquiva uma única vez
    Quando Mariana toca duas vezes rapidamente em "Arquivar"
    Então a conta é arquivada uma única vez

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com a conta "Poupança Souza"
    Quando Mariana tenta arquivar a conta "Poupança Souza" por endereço direto
    Então vê "Não encontrado"
```

## Experiência (UX/estados)
[FLUXO-010](../../flows/FLUXO-010-arquivar-conta-e-cartao.md): menu "…" rotulado na linha da conta ("Arquivar", "Excluir"); seção recolhida "Contas arquivadas (N)". Diálogos de confirmação com texto do que acontece.

## Fora de escopo
Arquivar cartão (US-033); mesclar contas; excluir conta com histórico; reordenar contas.

## Perguntas em aberto / pontos para o Tech Lead
- Modelo de arquivamento (campo `archivedAt` como em categorias, US-014) e invariantes do ledger (conta arquivada sem postagens novas); definição de "nunca teve movimentação" (lançamento de abertura de saldo zero).

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 13, Q-F11).
- 2026-10-04 — **Revisão pós-TL (D-PO-36):** TL = 5 (PO: 3: o lock em todos os caminhos de postagem pesa); "excluir" passa a ser **exclusão lógica terminal** (efeito idêntico para o usuário); acrescentados os cenários de nome liberado × nome de conta arquivada.
