# US-087 — Colunas do Extrato alinhadas entre as linhas

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-19 Ergonomia e Preferências (conferência do Extrato) · **UR-1 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Should** · 4,0 (V6/U3/R3) · **3** (toca todos os tipos de linha) |
| Status | Proposta pelo PO em 2026-10-26; o TL confirma se basta CSS/grade ou se muda a estrutura da linha (`ledger-row.tsx`) |
| Depende de | US-062 (filtros do Extrato) e US-040b (linha de parcela), sem bloqueio |
| Corte | 1ª a ser mantida do polimento (vem logo após a US-085) |
| Rastreabilidade | **NEED-034** item 7 (RN-034.3, 034.5) · NEED-016, NEED-022 · FLUXO-013 · D-PO-100 |

## História
Como **membro que confere o mês no Extrato**, quero **datas, descrições e valores alinhados na mesma coluna em todas as linhas**, para **ler e conferir sem esforço**.

## Regras
- O Extrato usa **uma grade de colunas fixa por largura de tela**: data, descrição (com categoria/tags), origem/conta, valor. Em cada largura, **a mesma coluna começa no mesmo ponto em todas as linhas**.
- Valores **alinhados à direita** com fonte de algarismos tabulares, de modo que as casas decimais e os sinais se alinhem verticalmente; data com largura fixa.
- Vale para **todos os tipos de linha** (RN-034.3): despesa, receita, compra no cartão, **parcela** (com "2/10" e "Ver compra"), **transferência** (duas pernas), **acerto**, **pagamento de fatura**, linha desfeita, selos ("Só meu", "via assistente") e linhas com tags: selos e tags **não empurram** as colunas; quebram para a segunda linha da descrição.
- Largura: em telas estreitas (< 640 px) as colunas se reorganizam em duas linhas por item (descrição + valor na 1ª, data + origem na 2ª), mas **a coluna do valor continua alinhada**; sem rolagem horizontal.
- Descrição longa é truncada com reticências e completa no detalhe; não altera o alinhamento.
- Não muda dados, filtros, ordenação, totais nem regra.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Alinhamento das colunas do Extrato

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E Mariana está autenticada
    E o Extrato de outubro tem despesa, receita, parcela "2/10", transferência, acerto e pagamento de fatura

  Cenário: Valores alinhados à direita na mesma coluna
    Quando Mariana abre o Extrato
    Então os valores de todas as linhas terminam na mesma posição horizontal
    E as casas decimais ficam alinhadas na vertical

  Cenário: Datas na mesma coluna
    Quando Mariana abre o Extrato
    Então a data de todas as linhas começa na mesma posição horizontal

  Cenário: Selos e tags não deslocam as colunas
    Dado que uma despesa tem a tag "viagem" e o selo "Só meu"
    Quando Mariana abre o Extrato
    Então o valor dessa linha continua alinhado com os das demais

  Cenário: Linha de parcela alinhada
    Quando Mariana vê a parcela "2/10"
    Então data, descrição e valor ocupam as mesmas colunas de uma despesa comum

  Cenário: Tela estreita
    Dado que a tela tem 375 pixels de largura
    Quando Mariana abre o Extrato
    Então a coluna do valor continua alinhada
    E não há rolagem horizontal

  Cenário: Descrição longa
    Dado uma despesa com descrição de 120 caracteres
    Quando Mariana abre o Extrato
    Então a descrição é truncada com reticências
    E as colunas continuam alinhadas
```

## Fora de escopo
Colunas configuráveis pelo usuário; exportar para planilha; mudar ordem ou agrupamento do Extrato.
