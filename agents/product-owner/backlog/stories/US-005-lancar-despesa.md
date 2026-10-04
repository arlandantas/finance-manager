# US-005 — Lançar uma despesa rapidamente

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-3 Transações & Categorização · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 4,6 · 5 |
| Status | Refinada (PO) — **substitui a antiga US-001** |
| Depende de | US-004 |
| Rastreabilidade | NEED-001 · NEED-002 · RN-001.1, RN-001.3, RN-002.2, RN-007.2 · FLUXO-001 (rev. 2) · ADR-001, ADR-006 · SDD-001 (a revisar) |

## História
Como **membro da família**, quero **registrar uma despesa no celular em menos de 10 segundos**, para **manter o controle sem atrito no momento da compra**.

## Regras de negócio aplicáveis
- **Autor do cadastro**: automático (usuário logado), imutável (RN-001.1).
- **Quem pagou** (D-PO-01): padrão = usuário logado; pode ser **outro membro** (RN-001.3). No MVP preenche *responsável pelo gasto* e *pagador*.
- **Dividir com a família?**: padrão **ligado** (despesa comum). Desligado = despesa pessoal, fora do rateio (RN-007.2).
- Despesa **reduz o saldo da conta** escolhida na data do lançamento (RN-002.2).
- Valor > 0, em **centavos inteiros**; data padrão = hoje; data retroativa permitida; data futura **não** nesta história (previstas = US-018).
- Descrição: 2 a 100 caracteres. **Opcional na UI** (vazia assume o nome da categoria) — ver Q-05.
- Conta pré-selecionada = última conta usada pelo membro.
- Salvar é **idempotente**: duplo clique não gera duas despesas.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Lançamento rápido de despesa

  Contexto:
    Dado a "Família Silva" com a conta "Nubank Conjunta" (saldo R$ 1.000,00)
    E os membros "Mariana" e "Lucas"
    E Lucas está autenticado

  Cenário: Despesa comum com sucesso
    Quando Lucas toca no botão "+", digita "R$ 150,50", escolhe a categoria "Supermercado" e toca em "Salvar Despesa"
    Então a despesa é registrada com autor "Lucas", quem pagou "Lucas", conta "Nubank Conjunta" e data de hoje
    E está marcada como "Dividir com a família"
    E o saldo de "Nubank Conjunta" passa a "R$ 849,50"
    E aparece o aviso "Despesa registrada com sucesso!"

  Cenário: Registrar em nome de outro membro
    Dado que Mariana pagou o supermercado de R$ 350,00
    Quando Lucas lança "R$ 350,00" em "Supermercado" e escolhe "Quem pagou: Mariana"
    Então o autor é "Lucas" e quem pagou é "Mariana"

  Cenário: Despesa pessoal
    Quando Lucas lança "R$ 80,00" em "Lazer e restaurantes" com "Dividir com a família" desligado
    Então a despesa é registrada como pessoal
    E não entra no acerto de contas

  Cenário: Valor obrigatório e positivo
    Quando Lucas tenta salvar com valor "R$ 0,00"
    Então vê "Informe um valor maior que zero"
    E nada é registrado

  Cenário: Categoria obrigatória
    Quando Lucas informa o valor mas não escolhe categoria e tenta salvar
    Então o campo categoria é destacado com "Escolha uma categoria"

  Cenário: Descrição omitida
    Quando Lucas salva "R$ 20,00" na categoria "Transporte" sem descrição
    Então a despesa é registrada com a descrição "Transporte"

  Cenário: Duplo clique não duplica
    Quando Lucas toca duas vezes rapidamente em "Salvar Despesa"
    Então apenas uma despesa é registrada
    E o saldo da conta é reduzido uma única vez

  Cenário: Data retroativa
    Quando Lucas abre "Mais detalhes" e escolhe a data de ontem
    Então a despesa é registrada com a data de ontem

  Cenário: Tentar data futura
    Quando Lucas escolhe uma data posterior a hoje
    Então vê "Para contas futuras, use Despesa prevista"

  Cenário: Falha de rede ao salvar
    Dado que não há conexão
    Quando Lucas toca em "Salvar Despesa"
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."
    E o formulário preserva o que foi digitado

  Cenário: Família sem conta cadastrada
    Dado que a família não tem contas
    Quando Lucas toca em "+"
    Então é orientado a "Cadastre uma conta primeiro" com atalho para a tela de contas

  Cenário: Meta de velocidade
    Quando Lucas executa o fluxo valor, categoria e salvar com os padrões
    Então o fluxo exige no máximo 4 interações (valor, categoria, salvar e, opcionalmente, conta)
```

## Experiência
[FLUXO-001 rev. 2](../../flows/FLUXO-001-lancamento-rapido.md): *drawer* inferior, valor em fonte grande com máscara BRL, grade de categorias, *switch* de divisão, botão fixo no rodapé. Campos secundários (data, observação) em *Mais detalhes*. Estados: ocioso, salvando (botão desabilitado com "Salvando…"), sucesso (aviso + fecha), erro.

## Fora de escopo
Receita (US-006), despesa prevista (US-018), compra no cartão (US-016), parcelamento (AP1), desdobramento em subitens (AP2), anexos/OCR, edição e exclusão (US-013), regra de divisão por lançamento (usa a da família, US-008).

## Perguntas em aberto / pontos para o Tech Lead
- **GAP-1**: o [SDD-001](../../../tech-lead/sdd/SDD-001-transacoes.md) **não possui `accountId`**, mas todo lançamento pertence a uma conta (NEED-002). Revisar.
- **GAP-2**: nomes divergem do ADR-006 (`isShared` e `paidByMemberId` contra `isSharedExpense` e `payerMemberId`) e falta o campo de autor. Unificar.
- **Q-05 (não bloqueante)**: descrição opcional na UI é decisão do PO para cumprir os 10 segundos; o TL pode manter `min(2)` no contrato preenchendo o padrão no cliente.
- **Q-D01 (Stakeholder)**: confirmar D-PO-01 (um único campo "Quem pagou?" no MVP).
