# US-089 — Conta pagadora padrão do cartão (sugerida ao pagar a fatura)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-6 Cartões de Crédito (fase 2) · **UR-1 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Should** · 4,3 (V6/U4/R3) · **3** |
| Status | Proposta pelo PO em 2026-10-26; precisa de SDD curto do TL (campo no cartão, migração, aviso de vencimento) |
| Depende de | US-015, US-017b, US-033 (implementadas). Alimenta a US-060 (fatura na conta pagadora) |
| Corte | Cortável antes da US-090/091; a US-060 funciona sem ela ("Sem conta definida") |
| Rastreabilidade | **NEED-032** (RN-032.1..6) · **Q-U22, Q-U23 (usuário, 2026-10-26)** · NEED-003 · FLUXO-004 · D-PO-101 |

## História
Como **membro da família**, quero **informar no cadastro do cartão a conta que paga a fatura**, para **que ela venha sugerida ao pagar e o app saiba de onde sai o valor**.

## Regras
- O cartão ganha o campo **"Conta que paga a fatura"** (opcional, **Q-U23**), no cadastro e na edição. Aceita só conta bancária ativa da família. Editável por qualquer membro que edita o cartão; **só o titular atual troca o titular** (regra vigente inalterada, RN-032.5).
- **Só sugere (Q-U22):** ao pagar a fatura (US-017b), a conta padrão vem **preenchida**, mas o membro escolhe outra no ato; o pagamento continua **integral, só após o fechamento**. **O app nunca paga sozinho.** Sem conta padrão, vale a conta de origem padrão inteligente (US-023).
- **Aviso do vencimento:** a fatura fechada e não paga aparece em "A pagar"/Início como hoje; com conta padrão, o item mostra "Sai da conta {nome}". Nenhum lembrete externo novo (e-mail/push) neste escopo.
- Conta padrão **arquivada ou excluída**: o cadastro do cartão mostra aviso "A conta {nome} foi arquivada" e o campo fica vazio; o cartão **não perde a capacidade de ser pago** (RN-032.3). Arquivar a conta (US-054) lista também os cartões que a usam como pagadora.
- Mudar a conta padrão **não altera pagamentos já feitos** nem faturas pagas (RN-032.6); vale para as faturas ainda não pagas.
- A conta padrão é a origem usada na **previsão por conta** (US-060) para a fatura em aberto (RN-032.4).
- Registro no histórico da família (`FamilyEvent`) quando a conta padrão muda: quem e quando.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Conta pagadora padrão do cartão

  Contexto:
    Dado a "Família Silva" com as contas "Corrente" e "Poupança" e os membros "Mariana" e "Lucas"
    E o cartão "Nubank Lucas" com fechamento dia 25 e vencimento dia 5
    E Lucas está autenticado

  Cenário: Definir a conta pagadora no cadastro
    Quando Lucas edita "Nubank Lucas" e escolhe "Conta que paga a fatura: Corrente"
    Então vê "Cartão atualizado"
    E "Nubank Lucas" mostra "Paga pela Corrente"

  Cenário: Conta pagadora é opcional
    Quando Lucas cria o cartão "Itaú Lucas" sem escolher a conta pagadora
    Então o cartão é criado normalmente

  Cenário: Conta sugerida ao pagar
    Dado "Nubank Lucas" com conta pagadora "Corrente" e fatura fechada de "R$ 1.500,00"
    Quando Lucas toca em "Pagar fatura"
    Então o campo "Pagar com" vem preenchido com "Corrente"

  Cenário: Escolher outra conta no ato
    Dado "Nubank Lucas" com conta pagadora "Corrente" e fatura fechada de "R$ 1.500,00"
    Quando Lucas escolhe "Poupança" em "Pagar com" e confirma
    Então o pagamento sai da "Poupança"
    E a conta pagadora padrão do cartão continua "Corrente"

  Cenário: O app não paga sozinho
    Dado "Nubank Lucas" com conta pagadora "Corrente" e fatura fechada vencendo hoje
    Quando o dia passa sem ninguém pagar
    Então a fatura continua em "A pagar" e nada é debitado da "Corrente"

  Cenário: Conta pagadora arquivada
    Dado "Nubank Lucas" com conta pagadora "Corrente"
    Quando Lucas arquiva a conta "Corrente"
    Então o diálogo de arquivar cita "Nubank Lucas" como cartão que usa a conta
    E depois de arquivada o cartão mostra o aviso "A conta Corrente foi arquivada"
    E a fatura ainda pode ser paga por outra conta

  Cenário: Trocar a conta padrão não muda pagamento já feito
    Dado a fatura de setembro paga pela "Corrente"
    Quando Lucas troca a conta pagadora para "Poupança"
    Então o pagamento de setembro continua debitado da "Corrente"
```

## Fora de escopo
Débito automático/baixa automática; pagamento parcial; lembrete por e-mail/push; conta pagadora diferente por mês.
