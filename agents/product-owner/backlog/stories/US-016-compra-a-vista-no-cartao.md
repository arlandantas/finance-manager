# US-016 — Lançar uma compra à vista no cartão

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-6 Cartões de Crédito (fase 1) · R2 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 2,8 · 5 |
| Status | Refinada (PO) — **fatia 016a** (fatia 016b: [US-016b](US-016b-corrigir-compra-no-cartao-e-filtro.md)) |
| Depende de | US-015, US-005 (drawer), US-007 (extrato) |
| Rastreabilidade | NEED-003 (RN-003.1, RN-003.3) · NEED-001 (RN-001.1, RN-001.3) · NEED-007 · FLUXO-001 (rev. 3), FLUXO-004 · D-PO-01, D-PO-06, D-PO-08 |

## História
Como **membro da família**, quero **lançar uma compra à vista no cartão pelo mesmo drawer rápido**, para **registrar o gasto na hora sem mexer no saldo da conta e vê-lo na fatura certa**.

## Regras de negócio aplicáveis
- No drawer de despesa, o chip **"Conta"** vira **"Pagar com"** e lista **contas e cartões**. Padrão = o último meio usado pelo membro (conta **ou** cartão). Sem cartões cadastrados, nada muda em relação à US-005.
- **Receita só entra em conta**: no modo Receita o seletor lista apenas contas.
- A compra no cartão é uma **despesa** como qualquer outra (valor > 0 em centavos, categoria obrigatória, descrição opcional, data padrão hoje, **quem pagou** = quem comprou, **dividir com a família** ligado por padrão, autor automático) e **continua no extrato, nos totais do mês e no acerto de contas** pela **data da compra** (RN-003.3; a despesa de consumo ocorre na compra, não no pagamento da fatura).
- **Não altera o saldo de nenhuma conta** (RN-003.1) e **consome o limite imediatamente**.
- **Fatura da compra** (ciclo do cartão): a compra entra na fatura que **fecha no primeiro dia de fechamento maior ou igual à data da compra** (compras **até o dia do fechamento, inclusive**, ficam naquela fatura; D-PO-06). Exemplo, fecha dia 25 e vence dia 5: compra de 15/10 ➔ fatura de out/2026 (fecha 25/10, vence 05/11); 25/10 ➔ mesma; 26/10 ➔ fatura de nov/2026 (fecha 25/11, vence 05/12); 26/12 ➔ fatura de jan/2027.
- **Limite**: compra que ultrapassa o disponível **não é bloqueada** (a compra já aconteceu): a interface avisa e pede confirmação; o disponível pode ficar negativo (D-PO-08).
- **Data**: retroativa permitida; **futura não** nesta release (compras futuras/parceladas são AP1).
- Salvar é **idempotente** (duplo clique não duplica a compra nem consome o limite duas vezes).
- Se a fatura de destino já estiver **paga** (US-017b), a compra é recusada (regra e cenário na US-017b).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Compra à vista no cartão

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E os membros "Mariana" e "Lucas"
    E hoje é 15/10/2026
    E Lucas está autenticado

  Cenário: Compra no cartão com sucesso
    Quando Lucas toca em "+", digita "R$ 300,00", escolhe "Supermercado", escolhe "Pagar com: Nubank Mariana" e toca em "Salvar Despesa"
    Então a despesa é registrada com autor "Lucas", quem pagou "Lucas", cartão "Nubank Mariana" e data de hoje
    E aparece o aviso "Despesa registrada com sucesso!"
    E o saldo de "Itaú Lucas" continua "R$ 3.000,00"
    E o limite disponível do cartão passa a "R$ 4.700,00"

  Cenário: A compra entra na fatura aberta
    Quando Lucas lança "R$ 300,00" no cartão "Nubank Mariana"
    Então a compra está na fatura de "out/2026" que fecha em 25/10 e vence em 05/11

  Cenário: Compra no dia do fechamento fica na fatura que fecha
    Dado que hoje é 25/10/2026
    Quando Lucas lança "R$ 100,00" no cartão "Nubank Mariana"
    Então a compra está na fatura de "out/2026"

  Cenário: Compra depois do fechamento vai para a próxima fatura
    Dado que hoje é 26/10/2026
    Quando Lucas lança "R$ 100,00" no cartão "Nubank Mariana"
    Então a compra está na fatura de "nov/2026" que fecha em 25/11 e vence em 05/12

  Cenário: Compra no fim do ano cai na fatura de janeiro
    Dado que hoje é 26/12/2026
    Quando Lucas lança "R$ 100,00" no cartão "Nubank Mariana"
    Então a compra está na fatura de "jan/2027" que fecha em 25/01 e vence em 05/02

  Cenário: Data retroativa muda a fatura
    Dado que hoje é 28/10/2026
    Quando Lucas lança "R$ 100,00" no cartão com a data 20/10/2026
    Então a compra está na fatura de "out/2026"

  Cenário: Registrar a compra em nome de outro membro
    Quando Lucas lança "R$ 350,00" em "Supermercado" no cartão "Nubank Mariana" e escolhe "Quem pagou: Mariana"
    Então o autor é "Lucas" e quem pagou é "Mariana"

  Cenário: Compra pessoal no cartão
    Quando Lucas lança "R$ 80,00" em "Lazer e restaurantes" no cartão com "Dividir com a família" desligado
    Então a compra é registrada como pessoal
    E não entra no acerto de contas

  Cenário: Compra compartilhada no cartão entra no acerto pela data da compra
    Dado a regra de divisão "igualitária"
    E que Mariana lançou "R$ 300,00" em "Supermercado" no cartão "Nubank Mariana" em 15/10/2026
    Quando abro o acerto de outubro
    Então vejo "Lucas deve R$ 150,00 a Mariana"

  Cenário: Compra no cartão entra nos totais do mês
    Quando Lucas lança "R$ 300,00" no cartão "Nubank Mariana"
    Então o total de despesas de outubro no extrato e na Home aumenta "R$ 300,00"
    E o saldo da família não muda

  Cenário: Compra acima do limite disponível
    Dado que o limite disponível do cartão é "R$ 100,00"
    Quando Lucas tenta salvar uma compra de "R$ 300,00" no cartão
    Então vê o aviso "Esta compra ultrapassa o limite disponível do cartão" com o botão "Confirmar mesmo assim"
    E ao confirmar a compra é registrada
    E o limite disponível passa a "-R$ 200,00"

  Cenário: Valor obrigatório e positivo
    Quando Lucas tenta salvar no cartão com valor "R$ 0,00"
    Então vê "Informe um valor maior que zero"
    E nada é registrado

  Cenário: Data futura não é permitida no cartão
    Quando Lucas escolhe, para uma compra no cartão, uma data posterior a hoje
    Então vê "A data da compra não pode ser futura"

  Cenário: Meio de pagamento padrão é o último usado
    Dado que a última despesa de Lucas foi no cartão "Nubank Mariana"
    Quando Lucas toca em "+"
    Então "Pagar com" vem com "Nubank Mariana"

  Cenário: Receita só aceita contas
    Quando Lucas alterna para "Nova Receita"
    Então o seletor "Receber em" lista apenas contas, sem cartões

  Cenário: Família sem cartões
    Dado que a família não tem cartões
    Quando Lucas toca em "+"
    Então o seletor lista apenas as contas e mostra o atalho "Cadastrar cartão"

  Cenário: Duplo clique não duplica
    Quando Lucas toca duas vezes rapidamente em "Salvar Despesa" para uma compra de "R$ 300,00" no cartão
    Então apenas uma compra é registrada
    E o limite disponível é reduzido uma única vez

  Cenário: Compra aparece no extrato
    Dado uma compra de "R$ 300,00" no cartão "Nubank Mariana"
    Quando abro o extrato
    Então a linha mostra "Nubank Mariana" no lugar da conta e o marcador "Cartão"
    E mostra a fatura "out/2026"

  Cenário: Falha de rede ao salvar
    Dado que não há conexão
    Quando Lucas toca em "Salvar Despesa" para uma compra no cartão
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."
    E o formulário preserva o que foi digitado
```

## Experiência (UX/estados)
- [FLUXO-001 rev. 3](../../flows/FLUXO-001-lancamento-rapido.md) e [FLUXO-004](../../flows/FLUXO-004-cartao-e-fatura.md): *chip* "Pagar com" abre uma lista com seções **Contas** e **Cartões**; ao escolher um cartão aparecem, sob o chip, a dica **"Entra na fatura de out/2026 · fecha 25/10"** e o **"Disponível R$ 4.700,00"** do cartão (cache de `["cards"]`).
- Aviso de limite no mesmo padrão do aviso de conta negativa (US-004): texto + botão *Confirmar mesmo assim*.
- Meta de velocidade da US-005 mantida: valor → categoria → salvar (a troca do meio de pagamento é a 4ª interação opcional).
- No extrato e no detalhe, a compra no cartão mostra o **cartão e a fatura** onde a conta apareceria.
- Estados idênticos à US-005 (salvando, sucesso, erro de campo, sem conexão).

## Fora de escopo
Parcelamento e projeção nas faturas seguintes (AP1); compra futura; estorno/crédito no cartão; corrigir ou excluir a compra e filtrar por cartão (US-016b); pagar a fatura (US-017b); ajuste manual da fatura; anuidade e juros.

## Perguntas em aberto / pontos para o Tech Lead
- **GAP-3**: o `Transaction` (SDD-001) exige `accountId`; a compra no cartão não tem conta. O TL decide o modelo (hipótese do PO: mesma tabela, com `cardId` e fatura, e `accountId` nulo para compras no cartão), mantendo **uma única função** de totais e de saldo (ADR-007 §6).
- **Q-20 (Stakeholder/Gestor, não bloqueante)**: no acerto, o crédito de uma compra no cartão vai para **quem comprou** (`payerMemberId`), não para quem paga a fatura depois. Se o casal paga a fatura de uma conta que não é de quem comprou, o acerto continua pela **data e autor do consumo**. Hipótese adotada (mais simples e coerente com RN-003.3); revisar na homologação da R2.

## Histórico
- 2026-10-04 — Refinada a partir do esboço; **fatiada** em 016a (esta) e 016b (corrigir/excluir e filtro por cartão), para respeitar o tamanho ≤ 5.
