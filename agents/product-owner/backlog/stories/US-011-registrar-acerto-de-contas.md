# US-011 — Registrar o acerto de contas como transferência

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-4 Divisão & Acerto de Contas · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 5,3 · 3 |
| Status | Refinada (PO) — aguarda SDD-002 |
| Depende de | US-009, US-010 |
| Rastreabilidade | NEED-007 · RN-007.3 · ADR-006 · FLUXO-003 |

## História
Como **membro devedor (ou credor)**, quero **registrar com 1 toque a transferência que quita o acerto do mês**, para **zerar o balanço e deixar o histórico auditável**.

## Regras de negócio aplicáveis
- O acerto é uma **transferência interna** entre a conta do devedor e a do credor (RN-007.3), marcada como **"Acerto de contas"** e ligada ao período.
- Valor sugerido = valor devido; **editável** (acerto parcial). Máximo = valor devido.
- Registrar o acerto **abate o balanço** do período; quitação total mostra "Tudo certo".
- Qualquer membro envolvido ou Administrador pode registrar.
- O acerto **não é despesa nem receita** e não entra no cálculo do próprio rateio.
- Histórico do acerto visível no painel (quem, quanto, quando, contas).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Registro do acerto de contas

  Contexto:
    Dado o acerto de outubro: "Lucas deve R$ 400,00 para Mariana"

  Cenário: Quitar integralmente
    Quando Lucas toca em "Registrar acerto" e escolhe a conta origem "Itaú Lucas" e a conta destino "Nubank Mariana"
    E confirma o valor sugerido de "R$ 400,00"
    Então "Itaú Lucas" é debitada em "R$ 400,00" e "Nubank Mariana" é creditada em "R$ 400,00"
    E a transferência é marcada como "Acerto de contas - Outubro"
    E o painel passa a exibir "Tudo certo neste mês"

  Cenário: Acerto parcial
    Quando Lucas registra "R$ 150,00" como acerto
    Então o painel exibe "Lucas deve R$ 250,00 para Mariana"

  Cenário: Valor acima do devido
    Quando Lucas informa "R$ 500,00"
    Então vê "O valor não pode ser maior que o devido (R$ 400,00)" e nada é registrado

  Cenário: Acerto não distorce receitas e despesas
    Quando consulto totais de despesas e receitas após o acerto
    Então o acerto não é contabilizado em nenhum deles

  Cenário: Histórico do acerto
    Quando abro o painel após o acerto
    Então vejo "Lucas transferiu R$ 400,00 para Mariana em 04/10" com as contas usadas

  Cenário: Nova despesa comum após o acerto
    Dado que o mês foi quitado
    Quando Mariana lança nova despesa comum de "R$ 200,00"
    Então o painel exibe "Lucas deve R$ 100,00 para Mariana"

  Cenário: Duplo clique não duplica
    Quando toco duas vezes em "Confirmar acerto"
    Então apenas um acerto é registrado

  Cenário: Origem igual ao destino
    Quando escolho a mesma conta nos dois campos
    Então vejo "Escolha contas diferentes"
```

## Experiência
[FLUXO-003](../../flows/FLUXO-003-acerto-de-contas.md): *drawer* *Registrar acerto* com valor, origem e destino pré-selecionados (conta principal de cada membro). Aviso ao confirmar.

## Fora de escopo
Pix/integração bancária, lembrete ou cobrança ao devedor, desfazer acerto (tratado em US-013 como estorno), acerto entre períodos.

## Perguntas em aberto / pontos para o Tech Lead
- Persistir `settlementPeriod` na transferência; garantir que `acerto` seja excluído dos totais de despesa/receita e do extrato de gasto.
