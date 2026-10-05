# US-042 — Compra parcelada dividida entra no acerto por parcela

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-20 Cartão Completo (parcelamento) · **R3** (junto com a US-040, na mesma entrega) |
| MoSCoW · WSJF · Tamanho (PO, preliminar) | Must · 2,7 · 3 |
| Status | Refinada (PO) · tamanho a confirmar pelo Tech Lead |
| Depende de | US-040, US-030, US-009a |
| Corte | **Não cortar** (sem ela, o parcelado fica "Só meu" e o acerto subestima) |
| Rastreabilidade | Parecer Q-F05 · NEED-003 (RN-003.8) · NEED-007, NEED-018, NEED-019 · Q-20/D-GES-13 · FLUXO-014 · D-PO-26 |

## História
Como **membro da família**, quero **dividir uma compra parcelada e ver cada parcela no acerto do mês em que cai na fatura**, para **não cobrar do outro uma dívida que ainda não saiu do meu bolso**.

## Regras de negócio aplicáveis
- Com acerto ligado, o campo "Dividir com a família" fica disponível também na compra parcelada.
- **Cada parcela** entra no acerto do **mês da fatura em que cai** (Q-F05, RN-003.8), **não** pelo total na data da compra.
- **Crédito a quem comprou** (Q-20/D-GES-13): quem registrou "Quem pagou" recebe o crédito de cada parcela, independentemente de quem paga a fatura.
- **Percentual da parcela** = o da **regra vigente na data da compra**, fixado para todas as parcelas (mudar a regra depois não reescreve parcelas já lançadas). Quando a EN-002 existir, é o **percentual gravado** na compra.
- Excluir/editar parcelas (US-041) recalcula o acerto dos meses afetados; parcelas em mês já acertado seguem as regras de mês acertado (US-013b).
- Compra parcelada **pessoal** ("Só meu") não entra no acerto.
- O painel de Acerto do mês identifica parcelas com o rótulo "n/N" na lista expansível de despesas (US-009b).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Parcelado dividido no acerto

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E a regra de divisão igual vigente
    E o acerto de contas ligado
    E o cartão "Nubank Lucas" com fechamento dia 25 e vencimento dia 5
    E hoje é 10/11/2026
    E Lucas está autenticado

  Cenário: Campo de divisão disponível no parcelado
    Quando Lucas escolhe o cartão "Nubank Lucas" e "3x" parcelas
    Então vê o interruptor "Dividir com a família" habilitado

  Cenário: Cada parcela entra no acerto do seu mês
    Quando Lucas lança "Geladeira" de "R$ 3.000,00" em "3x" dividindo com a família e paga por "Lucas"
    Então o acerto de nov/2026 considera "R$ 1.000,00" pago por Lucas
    E o acerto de dez/2026 considera "R$ 1.000,00" pago por Lucas
    E o acerto de jan/2027 considera "R$ 1.000,00" pago por Lucas

  Cenário: O total não entra de uma vez no acerto
    Quando Lucas lança "Geladeira" de "R$ 3.000,00" em "3x" dividindo com a família e paga por "Lucas"
    Então o acerto de nov/2026 não considera "R$ 3.000,00"

  Cenário: Cota por parcela com regra igual
    Quando Lucas lança "Geladeira" de "R$ 3.000,00" em "3x" dividindo com a família e paga por "Lucas"
    Então a cota de cada membro no acerto de nov/2026 é "R$ 500,00"
    E a diferença a acertar de nov/2026 é "R$ 500,00"

  Cenário: Quem pagou a fatura não muda o crédito
    Dado que Lucas lançou "Geladeira" de "R$ 3.000,00" em "3x" dividindo com a família e paga por "Lucas"
    Quando Mariana paga a fatura de nov/2026 com a conta "Itaú Mariana"
    Então o acerto de nov/2026 continua considerando "R$ 1.000,00" pago por Lucas

  Cenário: Mudar a regra depois não altera parcelas já lançadas
    Dado que Lucas lançou "Geladeira" de "R$ 3.000,00" em "3x" dividindo com a família
    E o Administrador salvou a regra "60% / 40%" a partir de hoje
    Quando Lucas abre o acerto de dez/2026
    Então a divisão da parcela "2/3" continua "50% / 50%"

  Cenário: Compra parcelada Só meu fica fora do acerto
    Quando Lucas lança "Notebook" de "R$ 2.500,00" em "10x" sem dividir
    Então o acerto de nov/2026 não muda

  Cenário: Excluir parcela recalcula o acerto do mês
    Dado que Lucas lançou "Geladeira" de "R$ 3.000,00" em "3x" dividindo com a família
    Quando Lucas exclui a parcela "2/3" de dez/2026
    Então o acerto de dez/2026 não considera mais "R$ 1.000,00"

  Cenário: Lista de despesas do acerto identifica a parcela
    Dado que Lucas lançou "Geladeira" de "R$ 3.000,00" em "3x" dividindo com a família
    Quando Mariana abre a lista de despesas do acerto de nov/2026
    Então vê "Geladeira 1/3 R$ 1.000,00"

  Cenário: Acerto desligado esconde o campo no parcelado
    Dado que o acerto de contas foi desligado
    Quando Lucas escolhe o cartão "Nubank Lucas" e "3x" parcelas
    Então não vê o interruptor "Dividir com a família"
```

## Experiência (UX/estados)
[FLUXO-014](../../flows/FLUXO-014-parcelamento-tags-e-analise.md): rótulo "As parcelas entram no acerto de cada mês" ao ligar "Dividir" num parcelado.

## Fora de escopo
Percentual diferente por parcela; acelerar o acerto das parcelas futuras; ajuste por juros.

## Perguntas em aberto / pontos para o Tech Lead
- Assimetria declarada: compra **à vista** divide pela **data da compra** (US-016a) e a **parcela** pelo **mês da fatura**. Se uma compra à vista feita em 28/11 cai na fatura de dez, ela conta em novembro, mas a parcela 1 de uma compra parcelada no mesmo dia conta em dezembro. Confirmar com o TL/Stakeholder (ver D-PO-26 e `pedidos-ao-tech-lead-r21-r3.md`).

## Histórico
- 2026-10-04 — Criada a partir do parecer (Q-F05, RN-003.8).
