# US-097 — Corrigir o valor do mês, reajustar e encerrar a assinatura

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-20 Cartão Completo (assinaturas) · **UR-2 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Should** · 3,3 (V5/U3/R2) · **3** |
| Status | Proposta pelo PO em 2026-10-26; sem SDD novo se reaproveitar editar/encerrar série (TL confirma) |
| Depende de | **US-096** |
| Corte | Cortável após a 096 e a 098 (sem ela, corrige-se a compra do mês pelo Extrato) |
| Rastreabilidade | **NEED-029** (RN-029.4) · **Q-U18 (usuário)** · US-016b, L-3 · FLUXO-004 · D-PO-104 |

## História
Como **membro da família**, quero **corrigir o valor de um mês, reajustar o preço dali em diante e encerrar a assinatura**, para **manter a fatura fiel sem reescrever o passado**.

## Regras
- **Corrigir o valor do mês (Q-U18):** como a cobrança é uma compra no cartão real, editar o valor/descrição/categoria dessa **cobrança do mês** (pelo Extrato ou pela fatura) é permitido como em qualquer compra (US-016b) e a marca como **"alterada"** (exceção). **Não** muda os outros meses. Trava na fatura **paga** (`INVOICE_PAID_LOCKED`).
- **Reajuste a partir de um mês (L-3):** "Editar assinatura" pede o **mês a partir do qual vale** (padrão: o próximo mês ainda não lançado). Cobranças já lançadas e as "alteradas" não são reescritas; a tela avisa quantas serão afetadas e quantas ficam.
- **Encerrar:** ação simples "Encerrar assinatura" (confirmação), **a partir do próximo mês**: a cobrança do mês corrente já lançada permanece; nada futuro é gerado; o histórico fica. Encerrar de novo ou editar encerrada: bloqueado com mensagem clara. Reativar = cadastrar nova.
- Controle e autoria: quem edita/encerra segue as regras de série e de "Só meu" (`so-meu.md`): o titular do cartão controla os "Só meu" lançados nele; o histórico registra quem alterou.
- Concorrência otimista (`version`) como nas séries.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Corrigir, reajustar e encerrar assinatura

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E a assinatura "Streaming" de "R$ 39,90" no "Nubank Lucas"
    E hoje é 08/11/2026 com a cobrança de novembro lançada
    E Lucas está autenticado

  Cenário: Corrigir o valor só do mês
    Quando Lucas altera a cobrança de novembro para "R$ 44,90"
    Então a fatura de novembro inclui "R$ 44,90"
    E a cobrança de dezembro continua prevista em "R$ 39,90"
    E a cobrança de novembro mostra o selo "Alterada"

  Cenário: Não corrige mês de fatura paga
    Dado a fatura de outubro paga
    Quando Lucas tenta alterar a cobrança de outubro
    Então vê que a fatura paga não pode ser alterada

  Cenário: Reajustar a partir de dezembro
    Quando Lucas edita a assinatura para "R$ 49,90" a partir de dezembro
    Então as cobranças de outubro e novembro continuam como estão
    E a cobrança de dezembro será de "R$ 49,90"

  Cenário: Aviso do que será afetado
    Quando Lucas escolhe reajustar a partir de dezembro
    Então vê quantas cobranças futuras serão afetadas e quantas ficam como estão

  Cenário: Encerrar a assinatura
    Quando Lucas encerra a assinatura "Streaming"
    Então a cobrança de novembro já lançada permanece
    E nenhuma cobrança é gerada em dezembro

  Cenário: Encerrar de novo
    Dado a assinatura "Streaming" encerrada
    Quando Lucas tenta encerrar a assinatura novamente
    Então vê "Assinatura já encerrada"

  Cenário: Edição simultânea
    Dado que Mariana alterou a assinatura depois de Lucas abri-la
    Quando Lucas salva sua alteração
    Então vê que a assinatura foi alterada por "Mariana"
```

## Fora de escopo
Pausar a assinatura; renegociar para parcelas; alterar cobrança de fatura paga.
