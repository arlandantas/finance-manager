# US-054 — Avisar antes de arquivar cartão e botão flutuante que não cobre ações em Contas

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-18 Manutenção de cadastros · **R2.2** |
| MoSCoW · WSJF · Tamanho (PO) | Should · 2,0 · 3 |
| Status | Refinada (PO) · aguarda SDD/estimativa do TL |
| Depende de | US-032, US-033, US-039 |
| Corte | **Cortável (2º do pacote R2.2)** |
| Rastreabilidade | Homologação R2.1 achados 2 e 5 (Melhorias; o 2 é "recomendado" pelo Stakeholder) · NEED-020 · D-PO-52 |

## História
Como **membro da família**, quero **saber de antemão tudo o que impede arquivar um cartão (e uma conta) e tocar nas ações de Contas sem o botão "+" na frente**, para **não precisar confirmar para descobrir o bloqueio e não errar o toque no celular**.

## Regras de negócio aplicáveis
- **(a) Aviso antecipado — cartão**: ao abrir "Arquivar" no cartão, o diálogo **já lista todos os impedimentos**, sem exigir confirmar: **fatura em aberto/fechada não paga** (com valor e mês) e **parcelas futuras** de compras parceladas (com o total). Se houver impedimento, o botão de confirmar fica **desabilitado** e há link para a fatura. Sem impedimento, o diálogo explica o efeito normal (some das listas, histórico preservado, reativável).
- **Conta**: o mesmo padrão. Ao abrir "Arquivar" na conta, mostra **saldo diferente de zero** (com atalho "Transferir o saldo") antes de confirmar; confirmar só habilita com impedimentos resolvidos.
- A validação **no servidor continua** (defesa contra tela desatualizada): se um impedimento surgir entre abrir e confirmar, a mensagem atual de bloqueio aparece.
- **(d) Botão flutuante (+) em Contas (mobile)**: o "+" **não cobre** o menu "Ações da conta" nem o botão "Reativar" em "Contas arquivadas": a lista tem **espaço inferior reservado** (a última linha rola acima do botão) e os menus de ação **abrem acima do botão** ou o escondem enquanto abertos. Vale para Contas, Cartões e Contas arquivadas.
- Mensagens neutras, sem prometer o que não existe (ex.: "parcelas futuras" só aparece se houver).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Avisar antes de arquivar e botão flutuante em Contas

  Contexto:
    Dado a "Família Silva" com o cartão "Nubank Roxinho" e a conta "Dinheiro" com saldo de "R$ 150,00"
    E Mariana está autenticada

  Cenário: Diálogo de arquivar cartão lista a fatura em aberto
    Dado que o cartão "Nubank Roxinho" tem fatura de "R$ 479,00" não paga em setembro de 2026
    Quando Mariana abre "Arquivar" no cartão "Nubank Roxinho"
    Então vê "Pague a fatura antes de arquivar o cartão"
    E vê a fatura de setembro de 2026 com "R$ 479,00"
    E o botão de confirmar está desabilitado

  Cenário: Diálogo lista fatura e parcelas futuras juntas
    Dado que o cartão "Nubank Roxinho" tem fatura não paga e parcelas futuras de "R$ 800,00"
    Quando Mariana abre "Arquivar" no cartão "Nubank Roxinho"
    Então vê o impedimento "Fatura não paga"
    E vê o impedimento "Parcelas futuras R$ 800,00"

  Cenário: Cartão sem impedimentos pode ser arquivado
    Dado que o cartão "Nubank Roxinho" não tem fatura não paga nem parcelas futuras
    Quando Mariana abre "Arquivar" no cartão "Nubank Roxinho"
    Então não vê impedimentos
    E o botão de confirmar está habilitado

  Cenário: Impedimento surgido depois de abrir o diálogo
    Dado que Mariana abriu "Arquivar" no cartão "Nubank Roxinho" sem impedimentos
    E outra pessoa lançou uma compra no cartão em seguida
    Quando Mariana confirma
    Então vê a mensagem de bloqueio do cartão
    E o cartão continua ativo

  Cenário: Diálogo de arquivar conta mostra o saldo antes de confirmar
    Quando Mariana abre "Arquivar" na conta "Dinheiro"
    Então vê "Para arquivar, o saldo precisa ser zero"
    E vê o atalho "Transferir o saldo"
    E o botão de confirmar está desabilitado

  Cenário: Botão flutuante não cobre o menu de ações da conta
    Dado um celular de 375 px de largura
    Quando Mariana abre "Ações da conta" na última conta da lista
    Então todas as opções do menu ficam visíveis
    E nenhuma opção está sob o botão "+"

  Cenário: Botão flutuante não cobre Reativar
    Dado um celular de 375 px de largura
    E a conta "Conta Teste" arquivada
    Quando Mariana abre "Contas arquivadas"
    Então o botão "Reativar" da última linha fica visível e tocável
```

## Experiência (UX/estados)
Diálogo com lista de impedimentos (ícone + texto + atalho). Estados *loading* enquanto a checagem roda (skeleton), erro com tentar de novo. Verificar 375 e 1280 px.

## Fora de escopo
Arquivamento em lote; reativação (US-033 já cobre); reposicionar o "+" nas demais telas (só Contas, Cartões e arquivadas).

## Perguntas em aberto / pontos para o Tech Lead
- Endpoint de **pré-checagem** de impedimentos (reuso da regra do `archive`, sem efeito colateral) e "parcelas futuras" (definição do TL-16).
- Padrão geral para o "+" cobrir telas de lista (espaço inferior reservado) em vez de ajuste por tela.

## Histórico
- 2026-10-05 — Criada a partir dos achados 2 e 5 da homologação da R2.1.
