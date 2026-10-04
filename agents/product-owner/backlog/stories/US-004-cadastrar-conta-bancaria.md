# US-004 — Cadastrar conta bancária com saldo inicial

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-2 Contas & Movimentações · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 6,3 · 3 |
| Status | Refinada (PO) |
| Depende de | US-002 |
| Rastreabilidade | NEED-002 · RN-002.1, RN-002.2 · ADR-001 (ledger, centavos) |

## História
Como **membro da família**, quero **cadastrar as contas bancárias da casa com o saldo de hoje**, para **ver quanto dinheiro a família realmente tem**.

## Regras de negócio aplicáveis
- Toda conta tem **titular (owner)** escolhido entre os membros (padrão: quem cadastra).
- **D-PO-02 (a validar):** no MVP **todos os membros da família enxergam e lançam em todas as contas**. Permissões granulares ficam para depois (US-020).
- Saldo da conta = **saldo inicial + entradas − saídas ± transferências** (RN-002.2).
- O saldo inicial é registrado como **lançamento de abertura** na data informada; não é editável depois que houver movimentações (correções virão com a conciliação, AP2).
- Saldo inicial **pode ser negativo** (conta no cheque especial).
- Valores em **centavos inteiros**.

**Tipos de conta:** Conta corrente, Poupança, Dinheiro/carteira.
**Instituições sugeridas:** Nubank, Itaú, Inter, Bradesco, Banco do Brasil, Caixa, Santander, C6, Outro (texto livre).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Contas bancárias

  Cenário: Cadastrar conta com sucesso
    Dado que Mariana está na tela "Contas"
    Quando cadastra nome "Itaú Mariana", instituição "Itaú", tipo "Conta corrente", titular "Mariana" e saldo inicial "R$ 1.500,00"
    Então a conta aparece na lista com saldo "R$ 1.500,00"
    E o saldo consolidado da família soma essa conta

  Cenário: Titular padrão
    Dado que Lucas abre o formulário de nova conta
    Então o campo "Titular" vem preenchido com "Lucas"

  Cenário: Saldo inicial negativo
    Dado que a conta está no cheque especial
    Quando cadastro saldo inicial "-R$ 300,00"
    Então a conta aparece com saldo "-R$ 300,00" destacado em vermelho

  Cenário: Campos obrigatórios
    Dado o formulário de nova conta
    Quando tento salvar sem nome ou sem tipo
    Então vejo mensagens de erro nos campos inválidos
    E nenhuma conta é criada

  Cenário: Nome duplicado na família
    Dado que já existe a conta "Itaú Mariana"
    Quando tento cadastrar outra com o mesmo nome
    Então vejo "Já existe uma conta com este nome"

  Cenário: Conta visível para os dois membros
    Dado que Mariana cadastrou a conta "Nubank Conjunta"
    Quando Lucas abre a tela "Contas"
    Então ele vê "Nubank Conjunta" com o mesmo saldo

  Cenário: Isolamento entre famílias
    Dado uma conta da "Família Silva"
    Quando um usuário da "Família Souza" lista contas
    Então a conta da "Família Silva" não aparece

  Cenário: Renomear conta
    Dado a conta "Itaú Mariana"
    Quando altero o nome para "Itaú Principal"
    Então a lista exibe "Itaú Principal" e o saldo permanece o mesmo
```

## Experiência
Lista de contas em cards (avatar do titular, instituição, saldo), total consolidado no topo, botão *Nova conta*. Estado vazio: "Cadastre sua primeira conta para começar".

## Fora de escopo
Arquivar/excluir conta, permissões por conta (US-020), caixinhas (AP2), conciliação (AP2), múltiplas moedas, importação de extrato (AP3).

## Perguntas em aberto / pontos para o Tech Lead
- **D-PO-02** precisa de validação do Stakeholder (não bloqueia o início).
- O TL deve decidir a representação do **lançamento de abertura** dentro do *ledger* imutável.
